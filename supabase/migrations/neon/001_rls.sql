-- ═══════════════════════════════════════════════════════════════════
-- 001_rls.sql — Row Level Security port: Supabase → Neon Data API
-- Task t_ce10555b (steel) · plan docs/plans/2026-10-22-neon-data-api-migration.md §Phase 1
--
-- WHAT THIS FILE IS
--   The complete, idempotent RLS definition for the Neon database that
--   replaces Supabase's database-level authorization. It is the ONLY
--   authorization layer the Neon Data API has (PostgREST-compatible: JWT →
--   Postgres role → GRANT + RLS), so a missing policy is a data leak.
--
--   Source of truth (extracted from, not replaced):
--     supabase/migrations/001_create_progress_tables.sql
--     supabase/migrations/004_quiz_run_stats.sql
--     supabase/migrations/005_user_profiles.sql
--     supabase/migrations/006_quiz_server_write_only.sql
--     supabase/migrations/007_user_profiles_hardening.sql
--     supabase/migrations/008_course_catalog.sql
--     supabase/migrations/009_learn_catalog.sql
--     supabase/migrations/010_constellation_foundation.sql
--     supabase/migrations/012_completion_events_server_write_only.sql
--   The original migrations are NOT edited, and are NOT applied to Neon.
--   Where a later migration superseded an earlier policy (003 over 001,
--   006 over 003, 007 over 005, 012 over 009) the SUPERSEDING definition is
--   what is ported — except where the live Supabase database differs, see
--   the "LIVE-vs-FILES DIVERGENCE" note below.
--
-- LIVE-vs-FILES DIVERGENCE (verified 2026-10-23 against zrggxfdyptiahskogwnn)
--   pg_policies on the live Supabase project holds 34 policies over 14
--   public tables. Migration 012 (completion_events server-write-only) is
--   NOT applied there: live still has `completion_events_insert_own` and no
--   `completion_events deny client insert`. This port mirrors LIVE, because
--   the acceptance criterion is policy-count parity with the live project.
--   That divergence is a real (pre-existing) Supabase hardening gap and is
--   flagged in the PR for val-el (R1-4) to decide on, not silently fixed
--   here: changing it would make the Neon policy set differ from the thing
--   it is verified against.
--
-- REWRITE TABLE (Supabase expression → Neon expression)
--   ┌──────────────────────────────┬───────────────────┬───────────────────────────────────────────┐
--   │ Supabase expression          │ Neon expression   │ Why                                       │
--   ├──────────────────────────────┼───────────────────┼───────────────────────────────────────────┤
--   │ auth.uid()                   │ auth.uid()        │ kept; Neon shim returns uuid. Every        │
--   │                              │                   │ user-id column in Neon is uuid             │
--   │                              │                   │ (verified: 11/11 are uuid), so all 30      │
--   │                              │                   │ auth.uid() occurrences stay uuid-typed.    │
--   │ auth.user_id() (text variant)│ auth.user_id()    │ shim provided and returns text, but NO     │
--   │                              │                   │ policy needs it: there is no text user-id  │
--   │                              │                   │ column in this schema. Documented, unused. │
--   │ auth.role()                  │ —                 │ zero occurrences in any policy; not shimmed│
--   │ auth.jwt()                   │ —                 │ zero occurrences in any policy; not shimmed│
--   │ REFERENCES auth.users(id)    │ REFERENCES "user" │ already done by neon_schema.sql; FKs are   │
--   │                              │                   │ not touched here (RLS-only file)           │
--   │ TO authenticated             │ TO authenticated  │ role created below if absent               │
--   │ anon role                    │ anonymous         │ Neon Data API's anonymous role name        │
--   │ (no TO clause) = PUBLIC      │ (no TO clause)    │ preserved exactly as live (roles={public}) │
--   │ is_admin() → auth.users      │ is_admin() → "user" join unchanged; SECURITY DEFINER recreated on Neon │
--   └──────────────────────────────┴───────────────────┴───────────────────────────────────────────┘
--
-- SECURITY MODEL (unchanged from Supabase)
--   * Table owner (neondb_owner) bypasses RLS: the Next.js server keeps its
--     direct-SQL privileged path working with no code change. RLS is the gate
--     for the Data API roles only.
--   * SELECT-own / INSERT-own / UPDATE-own / DELETE-own on progress tables.
--   * quiz_attempt / quiz_run are SERVER-WRITE-ONLY (deny guards, 006).
--   * admin_audit_log, user_roles writes, courses/entitlements/subscriptions
--     writes: admin-only via is_admin().
--   * Public reads: courses WHERE status='live', catalog_sections,
--     catalog_groups, course_prerequisites.
--
-- IDEMPOTENCY: safe to re-run. Every object is guarded (DO block for roles,
--   CREATE OR REPLACE for functions, DROP POLICY IF EXISTS + CREATE POLICY
--   for policies, idempotent GRANTs). The final verification block raises
--   if the policy inventory is short, so a partial apply cannot pass silently.
--
-- HOW TO APPLY
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f supabase/migrations/neon/001_rls.sql
--   Verify with: scripts/rls-isolation-check.py
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 0. Roles used by the Data API
--
--    `authenticated` is referenced by 21 of the 34 policies (TO authenticated)
--    and must exist before CREATE POLICY parses. `anonymous` carries the
--    public-read path. Both are NOLOGIN/NOSUPERUSER/NOBYPASSRLS so a JWT can
--    never reach a role that ignores RLS. Creating them here keeps this file
--    self-contained; R1-2 creates the login-side `authenticator` that SETs
--    ROLE to these and owns the Data API connection.
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    CREATE ROLE anonymous NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. auth shim — the two functions every ported policy calls
--
--    Reads the same `request.jwt.claims` GUC that PostgREST (and the Neon
--    Data API) sets from the validated JWT. Missing claim → NULL → every
--    own-row policy denies, which is the fail-closed direction.
--
--    auth.uid()  → uuid (uuid column comparison). Mirrors Supabase's
--                  null-on-missing behaviour and additionally returns NULL
--                  for a malformed (non-uuid) `sub` instead of erroring on
--                  every query.
--    auth.user_id() → text. Provided for parity with Neon's documented
--                  convention. UNUSED by this schema: no user-id column is
--                  text (all 11 are uuid, checked 2026-10-23).
-- ─────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  END
$$;

CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
    ''
  )
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. GRANTs — the baseline the Data API needs before RLS can be the gate.
--    RLS never grants, it only restricts: a role with no table privilege sees
--    nothing regardless of policy. These mirror what Supabase's
--    anon/authenticated roles carried.
-- ─────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anonymous;
GRANT USAGE ON SCHEMA auth   TO authenticated, anonymous;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anonymous;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- `public."user"` is Neon's Better Auth user table (the Supabase analogue is
-- auth.users, which was never exposed to anon/authenticated). It has NO RLS
-- policy set on Supabase and must not become readable through the Data API
-- just because it lives in `public`: revoke the blanket grants above. Auth
-- paths reach it through the privileged server connection only.
REVOKE ALL ON TABLE public."user" FROM authenticated, anonymous;

-- Future tables created BY THE APPLYING ROLE inherit the same baseline so a
-- new table cannot be silently unreachable... or silently open. Objects
-- created by other roles need their own default privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anonymous;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Membership for the verification harness only (scripts/rls-isolation-check.py
-- connects as the owner and `SET ROLE authenticated` to simulate a JWT). The
-- Data API itself uses `authenticator`, not this grant. Owner already
-- bypasses RLS, so this widens nothing.
DO $$
BEGIN
  EXECUTE format('GRANT authenticated TO %I', current_user);
  EXECUTE format('GRANT anonymous TO %I', current_user);
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. is_admin() — RLS backstop (008). SECURITY DEFINER so the lookup can
--    read user_roles even though RLS is on; owner (neondb_owner) bypasses
--    RLS, so the definer context is sufficient without BYPASSRLS.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Policies — 34 policies over 14 tables, byte-for-byte name parity with
--    live Supabase (see the count assertion at the end of this file).
-- ═════════════════════════════════════════════════════════════════════

-- ── read_progress (001, hardened by 003) ─────────────────────────────
ALTER TABLE public.read_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own read progress" ON public.read_progress;
CREATE POLICY "Users can view their own read progress"
  ON public.read_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own read progress" ON public.read_progress;
CREATE POLICY "Users can insert their own read progress"
  ON public.read_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own read progress" ON public.read_progress;
CREATE POLICY "Users can update their own read progress"
  ON public.read_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own read progress" ON public.read_progress;
CREATE POLICY "Users can delete their own read progress"
  ON public.read_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── lesson_completion (001, hardened by 003) ─────────────────────────
ALTER TABLE public.lesson_completion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own lesson completion" ON public.lesson_completion;
CREATE POLICY "Users can view their own lesson completion"
  ON public.lesson_completion FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own lesson completion" ON public.lesson_completion;
CREATE POLICY "Users can insert their own lesson completion"
  ON public.lesson_completion FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lesson completion" ON public.lesson_completion;
CREATE POLICY "Users can update their own lesson completion"
  ON public.lesson_completion FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own lesson completion" ON public.lesson_completion;
CREATE POLICY "Users can delete their own lesson completion"
  ON public.lesson_completion FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── quiz_attempt (001/003, made server-write-only by 006) ────────────
ALTER TABLE public.quiz_attempt ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own quiz attempts" ON public.quiz_attempt;
CREATE POLICY "Users can view their own quiz attempts"
  ON public.quiz_attempt FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Explicit deny guards: quiz correctness/score is recomputed server-side, so
-- a client JWT must never forge a row (CWE-807). The server writes through
-- the owner role, which bypasses RLS.
DROP POLICY IF EXISTS "quiz_attempt deny client insert" ON public.quiz_attempt;
CREATE POLICY "quiz_attempt deny client insert"
  ON public.quiz_attempt FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "quiz_attempt deny client update" ON public.quiz_attempt;
CREATE POLICY "quiz_attempt deny client update"
  ON public.quiz_attempt FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "quiz_attempt deny client delete" ON public.quiz_attempt;
CREATE POLICY "quiz_attempt deny client delete"
  ON public.quiz_attempt FOR DELETE TO authenticated
  USING (false);

-- ── quiz_run (004, made server-write-only by 006) ────────────────────
ALTER TABLE public.quiz_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own quiz runs" ON public.quiz_run;
CREATE POLICY "Users can view their own quiz runs"
  ON public.quiz_run FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_run deny client insert" ON public.quiz_run;
CREATE POLICY "quiz_run deny client insert"
  ON public.quiz_run FOR INSERT TO authenticated
  WITH CHECK (false);

-- ── user_profiles (005, hardened by 007) ─────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users select own profile" ON public.user_profiles;
CREATE POLICY "users select own profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users upsert own profile" ON public.user_profiles;
CREATE POLICY "users upsert own profile"
  ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own profile" ON public.user_profiles;
CREATE POLICY "users update own profile"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── user_roles (008) ─────────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;
CREATE POLICY "user_roles_admin_write"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── courses (008) ────────────────────────────────────────────────────
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courses_select_live_or_admin" ON public.courses;
CREATE POLICY "courses_select_live_or_admin"
  ON public.courses FOR SELECT
  USING (status = 'live' OR public.is_admin());

DROP POLICY IF EXISTS "courses_admin_write" ON public.courses;
CREATE POLICY "courses_admin_write"
  ON public.courses FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── user_entitlements (008) ──────────────────────────────────────────
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entitlements_select_own_or_admin" ON public.user_entitlements;
CREATE POLICY "entitlements_select_own_or_admin"
  ON public.user_entitlements FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "entitlements_admin_write" ON public.user_entitlements;
CREATE POLICY "entitlements_admin_write"
  ON public.user_entitlements FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── subscriptions (008) — read-only this build (ADR-204) ─────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_select_own_or_admin" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own_or_admin"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- ── admin_audit_log (008) — admin read + admin insert, never update/delete
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_admin" ON public.admin_audit_log;
CREATE POLICY "audit_select_admin"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "audit_insert_admin" ON public.admin_audit_log;
CREATE POLICY "audit_insert_admin"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (public.is_admin());

-- ── catalog_sections (009) ───────────────────────────────────────────
ALTER TABLE public.catalog_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sections_select_public" ON public.catalog_sections;
CREATE POLICY "sections_select_public"
  ON public.catalog_sections FOR SELECT USING (true);

DROP POLICY IF EXISTS "sections_admin_write" ON public.catalog_sections;
CREATE POLICY "sections_admin_write"
  ON public.catalog_sections FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── catalog_groups (009) ─────────────────────────────────────────────
ALTER TABLE public.catalog_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "groups_select_public" ON public.catalog_groups;
CREATE POLICY "groups_select_public"
  ON public.catalog_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "groups_admin_write" ON public.catalog_groups;
CREATE POLICY "groups_admin_write"
  ON public.catalog_groups FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── course_prerequisites (009) ───────────────────────────────────────
ALTER TABLE public.course_prerequisites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prereqs_select_public" ON public.course_prerequisites;
CREATE POLICY "prereqs_select_public"
  ON public.course_prerequisites FOR SELECT USING (true);

DROP POLICY IF EXISTS "prereqs_admin_write" ON public.course_prerequisites;
CREATE POLICY "prereqs_admin_write"
  ON public.course_prerequisites FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── completion_events (009; 012 not applied on Supabase live — see header)
ALTER TABLE public.completion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "completion_events_select_own" ON public.completion_events;
CREATE POLICY "completion_events_select_own"
  ON public.completion_events FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Mirrors LIVE Supabase. Migration 012 in the repo replaces this with a
-- `deny client insert` guard; that migration was never applied to the live
-- project, so porting the guard would break policy-count parity. FLAGGED for
-- val-el (R1-4) — see header.
DROP POLICY IF EXISTS "completion_events_insert_own" ON public.completion_events;
CREATE POLICY "completion_events_insert_own"
  ON public.completion_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE/DELETE policy anywhere: completion_events stays append-only
-- (ADR-211) for every non-owner role.

-- ═════════════════════════════════════════════════════════════════════
-- 5. Self-verification — a partial apply must fail loudly, not silently.
-- ═════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  expected CONSTANT text[][] := ARRAY[
    ['read_progress','4'], ['lesson_completion','4'], ['quiz_attempt','4'],
    ['quiz_run','2'], ['user_profiles','3'], ['user_roles','2'],
    ['courses','2'], ['user_entitlements','2'], ['subscriptions','1'],
    ['admin_audit_log','2'], ['catalog_sections','2'], ['catalog_groups','2'],
    ['course_prerequisites','2'], ['completion_events','2']
  ];
  rec text[];
  actual int;
  rls boolean;
BEGIN
  FOREACH rec SLICE 1 IN ARRAY expected LOOP
    SELECT count(*) INTO actual
      FROM pg_policies WHERE schemaname = 'public' AND tablename = rec[1];
    IF actual <> rec[2]::int THEN
      RAISE EXCEPTION 'RLS port incomplete: %.% policies found, % expected',
        rec[1], actual, rec[2];
    END IF;

    SELECT c.relrowsecurity INTO rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = rec[1];
    IF NOT coalesce(rls, false) THEN
      RAISE EXCEPTION 'RLS not enabled on public.%', rec[1];
    END IF;
  END LOOP;

  SELECT count(*) INTO actual FROM pg_policies WHERE schemaname = 'public';
  RAISE NOTICE 'RLS port OK: % policies on public (34 expected across the 14 app tables)', actual;
END
$$;
