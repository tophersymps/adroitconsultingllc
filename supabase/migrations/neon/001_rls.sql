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
-- INVENTORY: 37 POLICIES = 34 SUPABASE-ORIGIN + 3 NEON-ONLY ADMIN SELECT
--   Baseline: live Supabase (zrggxfdyptiahskogwnn) has 34 policies over 14
--   public tables; this file produces those same 34 (the completion_events
--   INSERT policy is swapped 1-for-1, see 1 below) PLUS the 3 Neon-only
--   admin-read policies from 003_admin_read_policies.sql (§4b below:
--   user_profiles_admin_select, lesson_completion_admin_select,
--   read_progress_admin_select), because the Neon Data API has no service key
--   and an authenticated admin would otherwise read 0 rows on the surfaces
--   that used to go through the Supabase service role. Total on Neon: 37.
--   This file creates them itself so a fresh Neon branch converges to the same
--   37 from 001 alone; 003 remains a no-op idempotent restatement. Any
--   inventory assertion (this file's §6, scripts/rls-isolation-check.py) must
--   expect 37; the harness keeps 34 as the ORIGIN count so origin parity
--   ("did the port lose or rename anything") stays separately answerable.
--
-- LIVE-vs-FILES DIVERGENCE — ONE DELIBERATE ONE, DO NOT "RESTORE PARITY"
--
--   1. completion_events — Neon INTENTIONALLY DIVERGES from live Supabase.
--      Live still has `completion_events_insert_own` (WITH CHECK
--      auth.uid() = user_id) because migration 012 was never applied there;
--      that policy lets any signed-in member INSERT arbitrary rows for
--      itself (event_type='certificate', any metadata) straight through the
--      Data API, bypassing the server-side milestone logic — val-el proved it
--      live in R1-4 (finding F-2). Neon ports 012's deny guard instead:
--      `completion_events deny client insert` (WITH CHECK (false)).
--      Why this is safe, and why parity is NOT the goal:
--        * Neon is a greenfield deployment — parity with a known-broken
--          policy is a liability, not a compatibility win.
--        * The server write path is `neondb_owner`, which carries BYPASSRLS,
--          so revoking client INSERT breaks nothing server-side.
--        * The table was empty (0 rows) when the change was made: no data or
--          backfill risk.
--      The swap is 1 policy in, 1 out, so the 34-policy origin baseline is
--      undisturbed.
--      If you are here to make Neon "match Supabase": re-read this paragraph.
--      The correct fix is to apply 012 to Supabase, not to reopen Neon.
--
--   2. public."user" — RLS ENABLED, deliberately with NO policy. RLS-on with
--      zero policies is default-deny: every non-owner role reads zero rows and
--      writes nothing, so the Better Auth user table survives a stray GRANT or
--      a re-created table inheriting pg_default_acl. §2 keeps the `REVOKE ALL`
--      as the first control (R1-4 verified both authenticated and anonymous
--      receive 42501, and both roles are NOBYPASSRLS/NOLOGIN), and §4 drops any
--      ad-hoc policy so the posture stays zero-policy. A Neon-only
--      `user_select_own` policy was considered and rejected: it would make the
--      inventory 38 (37 + 1) and it would re-open the table to a
--      grant-permitted role. The table owner
--      (neondb_owner, which the server connects as) bypasses RLS, so Better
--      Auth and the Next.js server are unaffected.
--      scripts/rls-isolation-check.py declares the 3 Neon-only admin SELECT
--      policies in NEON_ONLY_POLICIES (37 = 34 origin + 3), asserts both the
--      REVOKE denial and the RLS-on/zero-policy posture
--      (grants.user_table.default_deny), and would fail on a 38th policy.
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
--   for policies, membership grants guarded by pg_has_role()). The final
--   verification block raises if the policy inventory is short OR has extras,
--   so a partial or over-broad apply cannot pass silently.
--
--   The harness-only membership grants in §2 MUST stay conditional: on a
--   branch where the Data API created `authenticated`/`anonymous`,
--   neondb_owner is already a MEMBER of both but holds no ADMIN OPTION, so an
--   unconditional `GRANT authenticated TO current_user` aborts the whole
--   apply with `permission denied to grant role "authenticated"` before a
--   single policy is created (R1-4 F2).
--
-- ATOMICITY: the whole file runs in one explicit transaction (BEGIN ...
--   COMMIT below). psql otherwise executes statement-by-statement in
--   autocommit, so a failure halfway through would leave a partially applied
--   policy set — the exact failure mode F2 produced. The one non-transactional
--   statement is the §5 setval() repair, which is deliberately idempotent.
--
-- HOW TO APPLY
--   psql "$DATABASE_URL_UNPOOLED" -X -v ON_ERROR_STOP=1 --single-transaction \
--     -f supabase/migrations/neon/001_rls.sql
--   (--single-transaction is belt-and-braces; psql then prints two benign
--   "already a transaction" warnings around the file's own BEGIN/COMMIT.)
--   Verify with: scripts/rls-isolation-check.py
-- ═══════════════════════════════════════════════════════════════════

-- One transaction for the whole apply: nothing below is visible unless all of
-- it succeeds.
BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0. Roles used by the Data API
--
--    `authenticated` is referenced by 24 of the 37 policies (TO authenticated)
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
-- Defense in depth (R1-4 F-6, kept by t_77f4d97e F-1): the REVOKE stays the
-- first control, but real users' emails must not sit one careless GRANT (or
-- one inherited default-ACL path: pg_default_acl hands arwd to authenticated
-- on new public relations) away from exposure. So RLS is ENABLED on this table
-- and NO policy is created for it — RLS-on with zero policies is default-deny,
-- so every non-owner role gets zero rows (SELECT) and a withheld write even
-- after a stray GRANT. neondb_owner owns the table and bypasses RLS, so Better
-- Auth and the Next.js server are unaffected. Do NOT add a policy here (§4):
-- it would make the inventory 35 and re-open the table to client reads.
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

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
  -- Conditional: a re-run used to abort here with
  -- `permission denied to grant role "authenticated"` (only a role holding
  -- ADMIN OPTION on the target may grant it; `neondb_owner` is a member
  -- without it), which broke --single-transaction applies for everyone after
  -- the first (R1-4 F2 on t_31005930). Grant only when the membership is
  -- genuinely missing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles g ON g.oid = m.roleid
    WHERE g.rolname = 'authenticated'
      AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) THEN
    EXECUTE format('GRANT authenticated TO %I', current_user);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles g ON g.oid = m.roleid
    WHERE g.rolname = 'anonymous'
      AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) THEN
    EXECUTE format('GRANT anonymous TO %I', current_user);
  END IF;
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

-- It is SECURITY DEFINER with a BYPASSRLS owner, so it is the gate under every
-- admin policy: an unnecessary PUBLIC execute grant hands that gate to anyone
-- who can reach the database (R1-4 F-5). Restrict it to the two Data API roles.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
-- `anonymous` is granted too, deliberately: the public-read policies on
-- courses / catalog_* are scoped to PUBLIC (no TO clause, mirroring live) and
-- call is_admin(); evaluating them as `anonymous` would raise
-- `permission denied for function is_admin` if that role could not execute it.
-- The function takes no arguments and only reads the caller's own claims, so
-- this exposes nothing.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anonymous;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Policies — the 34 policies over 14 tables ported by name from live
--    Supabase, plus the 3 Neon-only admin SELECT policies in §4b.
--    The completion_events INSERT policy is 012's deny guard, not
--    live Supabase's forgeable insert_own — see the header note.
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

-- ── completion_events (009, made server-write-only by 012) ───────────
ALTER TABLE public.completion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "completion_events_select_own" ON public.completion_events;
CREATE POLICY "completion_events_select_own"
  ON public.completion_events FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Ported from 012_completion_events_server_write_only.sql. completion_events is
-- SERVER-WRITE-ONLY: the columns a client could forge — event_type
-- (lesson/course/quiz/exam/certificate), course_id, lesson slugs, metadata,
-- completed_at — are exactly what certificates, constellations, streaks and
-- rank read. `WITH CHECK (auth.uid() = user_id)` is therefore NOT a harmless
-- own-row write: it mints credentials without doing the work (CWE-807),
-- proven exploitable on the ported version in R1-4 (F-2).
--
-- The one legitimate write path is appendCompletionEvent() in
-- src/lib/completion.ts behind the server-side API routes, which validates
-- input and applies the idempotency guard. On Neon that path connects as
-- neondb_owner (BYPASSRLS), so it ignores RLS and is unaffected here.
--
-- Note on layering: permissive policies for the same command are ORed, so this
-- deny guard does not by itself survive a *later* permissive INSERT policy
-- being re-added. The harness assertion `completion_events.insert_denied`
-- (42501 for an authenticated INSERT) is what catches that regression.
DROP POLICY IF EXISTS "completion_events_insert_own" ON public.completion_events;
DROP POLICY IF EXISTS "completion_events deny client insert" ON public.completion_events;
CREATE POLICY "completion_events deny client insert"
  ON public.completion_events FOR INSERT TO authenticated
  WITH CHECK (false);

-- No UPDATE/DELETE policy anywhere: completion_events stays append-only
-- (ADR-211) for every non-owner role.

-- ═════════════════════════════════════════════════════════════════════
-- 4b. Admin read policies — NEON-ONLY (003_admin_read_policies.sql)
--
--    The admin surface (/api/admin/users, /api/admin/users/:id,
--    /api/admin/analytics, /api/admin/access/effective) read with the Supabase
--    service-role key, which bypassed RLS. The Neon Data API has NO service
--    key: every request is the caller's own JWT, filtered by RLS. With only the
--    owner policies above, an authenticated admin would read 0 rows — display
--    names would vanish and analytics would report zeros while the routes still
--    answered 200. These 3 SELECT-only policies give the admin read paths what
--    every other admin surface in §4 already has (public.is_admin()).
--
--    SELECT only, TO authenticated, USING (public.is_admin()). No write
--    capability is added: privileged writes still go through the deny-client
--    guards and the direct-SQL helpers in src/lib/db/services (owner role).
--    These are NOT Supabase-origin policies — they are the 3 of the 37 that
--    live only on Neon (34 origin + 3 Neon-only = 37). They are created here so
--    this file converges a fresh branch to the same inventory it verifies in
--    §6; 003_admin_read_policies.sql restates the identical definitions and is
--    now a no-op on branches that applied this file.
-- ═════════════════════════════════════════════════════════════════════
-- user_profiles — admin users list / effective-access matrix read every profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_profiles_admin_select" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_select"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- lesson_completion — /api/admin/analytics aggregates completions per course
ALTER TABLE public.lesson_completion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lesson_completion_admin_select" ON public.lesson_completion;
CREATE POLICY "lesson_completion_admin_select"
  ON public.lesson_completion FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- read_progress — same analytics aggregate, reads per content slug
ALTER TABLE public.read_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_progress_admin_select" ON public.read_progress;
CREATE POLICY "read_progress_admin_select"
  ON public.read_progress FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ── "user" — RLS ON with ZERO policies by design (do NOT add a policy) ──
-- Not ported from Supabase (auth.users is a different object there and was
-- never policy'd) and deliberately NOT given a Neon-only policy. The design
-- agreed with the R1-4 security review (F-1) is: RLS enabled (§2) with no
-- policy at all, i.e. default-deny for every non-owner role. On top of the
-- REVOKE ALL in §2 that means authenticated/anonymous see zero rows and can
-- write nothing even if a stray GRANT (or a re-created table picked up by
-- pg_default_acl) re-grants the table; neondb_owner, which owns the table,
-- bypasses RLS so Better Auth and the Next.js server keep working.
-- A user_select_own policy here would make the inventory 38 (37 + 1) and let a
-- grant-permitted role read its own row; the 37-policy baseline (34 origin +
-- the 3 Neon-only admin SELECTs in §4b) is what the security review and QA both
-- sign off on. Do not add one.
--
-- This block exists because policy state belongs to THIS file: if an ad-hoc
-- user_select_own policy was applied to the branch, the file converges the
-- database back to the reviewed design instead of silently reporting 35, and
-- re-asserts ENABLE in case it was turned off (it is also set in §2 — this is
-- the authoritative statement for the table).
DROP POLICY IF EXISTS "user_select_own" ON public."user";
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════
-- 5. Post-load repair — identity sequences vs imported data
--
--    The branch was data-loaded with explicit ids, so every
--    GENERATED ... AS IDENTITY sequence starts behind the rows it must
--    continue from. The first server-side INSERT then collides on the PK
--    (`duplicate key (id)=(N)`) *after* the business mutation has already
--    committed, because the audit row is written in the same request but a
--    separate statement. On admin routes that means a 500 with the mutation
--    applied and no audit trail (ADR-205 requires one row per mutation).
--    Reproduced live in R1-4 (F-1: last_value=20, max(id)=82).
--
--    setval() is NON-TRANSACTIONAL and cannot be rolled back, which is why it
--    lives here at apply time rather than in the verification harness. Re-running
--    this file is safe: it only realigns when the sequence is behind.
--    scripts/rls-isolation-check.py asserts the invariant
--    (`sequence.admin_audit_log.in_sync`) so a future data import cannot
--    silently reintroduce the gap.
-- ═════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  seq_name text;
  max_id   bigint;
  last_id  bigint;
BEGIN
  SELECT pg_get_serial_sequence('public.admin_audit_log', 'id') INTO seq_name;
  IF seq_name IS NULL THEN
    RAISE EXCEPTION 'admin_audit_log has no identity/sequence on id — cannot align sequence';
  END IF;

  EXECUTE 'SELECT max(id) FROM public.admin_audit_log' INTO max_id;
  EXECUTE format('SELECT last_value FROM %s', seq_name) INTO last_id;

  IF coalesce(max_id, 0) > coalesce(last_id, 0) THEN
    PERFORM setval(seq_name, max_id);
    RAISE NOTICE 'admin_audit_log sequence realigned: % -> %', last_id, max_id;
  ELSE
    RAISE NOTICE 'admin_audit_log sequence already in sync (last_value=%, max(id)=%)',
      last_id, coalesce(max_id, 0);
  END IF;
END
$$;

-- ═════════════════════════════════════════════════════════════════════
-- 6. Self-verification — a partial apply must fail loudly, not silently.
-- ═════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  expected CONSTANT text[][] := ARRAY[
    ['read_progress','5'], ['lesson_completion','5'], ['quiz_attempt','4'],
    ['quiz_run','2'], ['user_profiles','4'], ['user_roles','2'],
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
  IF actual <> 37 THEN
    RAISE EXCEPTION
      'RLS port policy count is %, expected exactly 37 (34 Supabase-origin + 3 '
      'Neon-only admin SELECT) — an extra policy is a loosened gate, a short '
      'one is a lost one', actual;
  END IF;
  RAISE NOTICE 'RLS port OK: % policies on public (37 expected: 34 origin + 3 Neon-only admin SELECT across the 14 app tables)', actual;
END
$$;

-- Everything above commits together or not at all (see BEGIN at the top).
COMMIT;
