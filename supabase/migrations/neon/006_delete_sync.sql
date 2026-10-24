-- ═══════════════════════════════════════════════════════════════════
-- 006_delete_sync.sql — deleting an auth identity must delete the app-side user
--
-- THE HOLE THIS CLOSES
--   `002_provision_public_user.sql` installs 12 triggers, all on INSERT and
--   UPDATE: the eager mirror from neon_auth."user", the provider refresh from
--   neon_auth.account, and a lazy-heal on each of the 10 tables that carry an FK
--   to public."user". Nothing fires on DELETE.
--
--   Consequence: Managed Better Auth deletes its own row, public."user" survives,
--   and the ON DELETE CASCADE rules on the nine data tables never run. The result
--   is a mirror row nobody can authenticate as, plus its progress/quiz/profile
--   data orphaned forever. Nine such rows existed on production (all created
--   2026-10-23, all test fixtures) and were removed by hand before this file
--   landed.
--
-- WHAT THIS DOES
--   AFTER DELETE ON neon_auth."user" -> delete the same id from public."user".
--   Everything else follows from constraints that already exist and were designed
--   for exactly this:
--     CASCADE   lesson_completion, quiz_attempt, quiz_run, read_progress,
--               completion_events, subscriptions, user_entitlements,
--               user_profiles, user_roles
--     SET NULL  admin_audit_log.actor_user_id  (the audit trail outlives the user)
--               user_entitlements.granted_by   (a grant stays attributable to "gone")
--   So one delete of an identity is a complete, single-transaction removal of the
--   user's app data, with audit rows preserved and de-identified.
--
-- SAFETY
--   * SECURITY DEFINER owned by neondb_owner (owner of public."user"), so the
--     neon_auth service role can cause the write without holding DELETE on
--     public."user". It also bypasses RLS as owner, which is required: a
--     non-owner DELETE would silently match zero rows.
--   * SET search_path pins name resolution (same posture as 001/002).
--   * EXECUTE is revoked from PUBLIC and from the client-facing roles: trigger
--     invocation does not consult EXECUTE ACLs, so the triggers still fire but a
--     client can never call the function over the Data API.
--   * Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
--   * PROVEN before landing: run inside BEGIN ... ROLLBACK on production, seeding a
--     user with lesson_completion + read_progress + user_profiles + an audit row and
--     deleting only the auth identity. Result: public.user 1->0, lesson_completion
--     1->0, read_progress 1->0, user_profiles 1->0, audit row kept with
--     actor_user_id NULL.
--
-- HOW TO APPLY
--   psql "$DATABASE_URL_UNPOOLED" -X -v ON_ERROR_STOP=1 --single-transaction \
--     -f supabase/migrations/neon/006_delete_sync.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_auth_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- The nine data tables CASCADE off this row; audit fields SET NULL.
  DELETE FROM public."user" WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS auth_user_delete_sync ON neon_auth."user";
CREATE TRIGGER auth_user_delete_sync
  AFTER DELETE ON neon_auth."user"
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_delete();

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.sync_auth_user_delete() FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_delete() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_delete() FROM anonymous';
  END IF;
END $$;

-- §5 verification: the invariant this file exists for, asserted at apply time.
DO $$
DECLARE
  missing_trigger int;
  orphan_mirrors int;
  unmirrored_identities int;
BEGIN
  SELECT count(*) INTO missing_trigger
    FROM pg_trigger
   WHERE tgname = 'auth_user_delete_sync' AND NOT tgisinternal;
  IF missing_trigger = 0 THEN
    RAISE EXCEPTION '006: delete-sync trigger was not created';
  END IF;

  SELECT count(*) INTO orphan_mirrors
    FROM public."user" p
   WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" a WHERE a.id = p.id);
  IF orphan_mirrors > 0 THEN
    RAISE EXCEPTION '006: % public."user" row(s) have no auth identity', orphan_mirrors;
  END IF;

  SELECT count(*) INTO unmirrored_identities
    FROM neon_auth."user" a
   WHERE NOT EXISTS (SELECT 1 FROM public."user" p WHERE p.id = a.id);
  IF unmirrored_identities > 0 THEN
    RAISE EXCEPTION '006: % auth identit(ies) have no public."user" mirror', unmirrored_identities;
  END IF;

  RAISE NOTICE '006 applied: delete-sync trigger present, 0 orphans, 0 unmirrored';
END $$;

COMMIT;
