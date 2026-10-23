-- 003_admin_read_policies.sql — let an admin read across users, through the Data API.
--
-- WHY (R2-2, 2026-10-23): the admin surface (/api/admin/users, /api/admin/users/:id,
-- /api/admin/analytics, /api/admin/access/effective) used to read with the Supabase
-- service-role key, which bypassed RLS. The Neon Data API has no service key: every
-- request is the caller's JWT, filtered by RLS. Three user-scoped tables shipped only
-- owner policies in 001_rls.sql, so an authenticated *admin* would read 0 rows — the
-- users list would lose display names and analytics would report zeros while the routes
-- still returned 200. That is a silent functional regression, so the admin read paths
-- get the same treatment every other admin surface already has in 001 (is_admin()).
--
-- SCOPE: SELECT only, TO authenticated, USING ((SELECT public.is_admin())). No write
-- policies are added or changed here — privileged writes still go through the
-- deny-client-insert guards and the direct-SQL helpers in src/lib/db/service.ts.
--
-- Mirrors 001_rls.sql section 5 (user_roles / entitlements / subscriptions / courses),
-- which already grant admin SELECT via public.is_admin(). Idempotent: safe to re-apply.
--
-- PERFORMANCE (t_61fbf171): each USING clause calls is_admin() as
-- `(SELECT public.is_admin())` so the planner turns it into an InitPlan (one
-- evaluation per statement, ~130x cheaper on the analytics aggregate) instead of
-- a per-row Filter — is_admin() is SECURITY DEFINER and cannot be inlined.
-- Keep the definitions byte-identical to 001_rls.sql §4b.
--
-- NOTE (t_de7db90d): 001_rls.sql §4b now creates these same three policies itself,
-- so a fresh branch converges to the 37-policy inventory (34 origin + 3 Neon-only)
-- from 001 alone. This file is kept as the identical, idempotent restatement for
-- branches/DBs that already applied it; once 001 has run it is a no-op.
--
-- Apply:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/neon/003_admin_read_policies.sql
-- (RLS policy changes do not need `neon data-api refresh-schema`; that is only for
--  tables/columns, which the Data API caches.)

BEGIN;

-- ── user_profiles — admin users list / effective-access matrix read every profile ──
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_profiles_admin_select" ON public.user_profiles;
CREATE POLICY "user_profiles_admin_select"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- ── lesson_completion — /api/admin/analytics aggregates completions per course ──
ALTER TABLE public.lesson_completion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lesson_completion_admin_select" ON public.lesson_completion;
CREATE POLICY "lesson_completion_admin_select"
  ON public.lesson_completion FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- ── read_progress — same analytics aggregate, reads per content slug ──
ALTER TABLE public.read_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_progress_admin_select" ON public.read_progress;
CREATE POLICY "read_progress_admin_select"
  ON public.read_progress FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

COMMIT;
