-- ═══════════════════════════════════════════════════════════════════
-- 008_course_catalog.sql — Course Catalog + Entitlements + Admin (PLATFORM)
-- Task t_2eab480f (steel) · brainiac arch t_22b26cb9 · 2026-08-25
--
-- DB IS THE SOURCE OF TRUTH for course status + entitlements (ADR-200).
-- Content bodies stay in content/learn/; this schema never stores them.
-- Mirrors: docs/system-architecture-course-catalog-admin.html
-- Contract types: src/shared/contracts-course-catalog.ts
--
-- Five tables + one helper + RLS. The server-side access seam
-- (src/lib/access.ts) is the authoritative gate; RLS is defense-in-depth
-- (ADR-202) so a raw client (anon key + JWT) can never read pending/archived
-- courses, others' entitlements, subscriptions, or the audit log.
--
-- ORDER MATTERS: SQL-language functions validate their body at CREATE time,
-- so is_admin() must be created AFTER user_roles exists.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. user_roles — who is an admin. Default member; no row = member (US-003).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'member'
             check (role in ('admin', 'member')),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. courses — lifecycle + access model. series_slug UNIQUE = join key to
-- content/learn/<series>. No row for a series = "not launched".
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.courses (
  id           uuid primary key default gen_random_uuid(),
  series_slug  text not null unique,
  title        text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'live', 'archived')),
  access_model text not null default 'granted'
               check (access_model in
                 ('free', 'subscription', 'one-time', 'sub-or-one-time', 'granted')),
  price_cents  int,
  launched_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists courses_status_idx on public.courses(status);

-- ─────────────────────────────────────────────────────────────────────
-- 3. user_entitlements — who may read gated content. Revoke = soft delete
-- (revoked_at set; row kept for audit/matrix history — ADR-203).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.user_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  source      text not null check (source in ('granted', 'one-time')),
  grant_note  text,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint unique_active_entitlement unique (user_id, course_id, source)
);

create index if not exists user_entitlements_user_idx
  on public.user_entitlements(user_id);
create index if not exists user_entitlements_course_idx
  on public.user_entitlements(course_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. subscriptions — READ-ONLY this build (ADR-204). Future Stripe webhook
-- writes it; nothing in the app does. No client INSERT/UPDATE/DELETE policy.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  plan               text not null default 'learn',
  status             text not null default 'active'
                     check (status in ('active', 'trialing', 'canceled', 'past_due')),
  current_period_end timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. admin_audit_log — every admin mutation writes one row (ADR-205).
-- Read-only in the panel (US-015). No client UPDATE/DELETE.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references auth.users(id) on delete set null,
  action         text not null,
  target_type    text not null,
  target_id      text,
  details        jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 6. is_admin() — RLS backstop (created AFTER user_roles exists). True iff
-- the current auth.uid() has an 'admin' row in user_roles. SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. RLS policies (defense-in-depth — the server seam is authoritative).
-- ─────────────────────────────────────────────────────────────────────

alter table public.user_roles enable row level security;
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write"
  on public.user_roles for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.courses enable row level security;
drop policy if exists "courses_select_live_or_admin" on public.courses;
create policy "courses_select_live_or_admin"
  on public.courses for select
  using (status = 'live' or public.is_admin());
drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write"
  on public.courses for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_entitlements enable row level security;
drop policy if exists "entitlements_select_own_or_admin" on public.user_entitlements;
create policy "entitlements_select_own_or_admin"
  on public.user_entitlements for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists "entitlements_admin_write" on public.user_entitlements;
create policy "entitlements_admin_write"
  on public.user_entitlements for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  using (auth.uid() = user_id or public.is_admin());

alter table public.admin_audit_log enable row level security;
drop policy if exists "audit_select_admin" on public.admin_audit_log;
create policy "audit_select_admin"
  on public.admin_audit_log for select
  using (public.is_admin());
drop policy if exists "audit_insert_admin" on public.admin_audit_log;
create policy "audit_insert_admin"
  on public.admin_audit_log for insert
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 8. Seeds.
-- ─────────────────────────────────────────────────────────────────────

-- Seed the admin row for Chris via a WHERE email = match against auth.users
-- (idempotent — no-op if the auth user row doesn't exist yet or is already admin).
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where email = 'chris@adroit.io'
on conflict (user_id) do nothing;

-- Seed live rows for the CURRENT published series so existing public course
-- content stays reachable (migration risk mitigation, arch §10).
-- access_model='free' → granted to everyone (incl. guests), preserving the
-- existing public-lesson behaviour. No entitlements exist yet, so 'granted'
-- would paywall every signed-in user — 'free' is the correct non-breaking seed.
-- Truly-new series get NO row → "not launched" (admin-only).
insert into public.courses (series_slug, title, status, access_model, launched_at)
values
  ('agentic-ai',          'Agentic AI Implementation Path',       'live', 'free', now()),
  ('ai-at-work',          'AI at Work',                           'live', 'free', now()),
  ('omni-studio-cert',    'OmniStudio Developer Certification',  'live', 'free', now()),
  ('salesforce-architect','Salesforce System Architect Path',     'live', 'free', now())
on conflict (series_slug) do nothing;
