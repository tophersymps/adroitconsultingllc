-- ═══════════════════════════════════════════════════════════════════
-- 007_user_tombstone.sql — give real deletions a recovery window
--
-- WHY
--   006 made deleting an auth identity cascade immediately into public."user",
--   which is correct for test accounts and irreversible for real ones. A mistaken
--   delete in the Neon console (or a bad admin call) destroyed a paying user's
--   progress with no way back, because Better Auth's own delete is not reversible
--   either.
--
-- WHAT CHANGES
--   * public."user" gains `deleted_at` (the tombstone marker) and `is_test`
--     (hard-delete marker for throwaway accounts).
--   * The AFTER DELETE trigger now branches:
--       is_test = true            -> DELETE the mirror row, CASCADE removes data
--                                    (QA cleanup stays instant and complete)
--       is_test = false (default) -> stamp deleted_at, keep the row and all of its
--                                    progress/quiz/profile/entitlement rows intact
--   * Nothing in the app reads public."user" for listings (the admin list reads
--     neon_auth."user"), so a tombstone is invisible to the product and cannot
--     authenticate: the identity is gone, so no JWT can ever carry that sub.
--
-- RECOVERY (inside the window)
--   1. Recreate the auth identity with the ORIGINAL uuid, so the FK rows line up:
--        INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
--        VALUES ('<old-uuid>', '<name>', '<email>', true, now(), now());
--      (Better Auth cannot set a password on a direct insert; the user completes a
--      password reset afterwards. The identity row is what the FKs need.)
--   2. Clear the tombstone:
--        SELECT public.restore_tombstoned_user('<old-uuid>');
--   3. Everything the user had is still there.
--   Note the honest limit: this restores a MISTAKEN deletion. It does not merge a
--   returning user's fresh signup (new uuid) into their old data.
--
-- PURGE
--   ~/.hermes/scripts/tombstone-purge.py (daily cron) hard-deletes tombstones past
--   the window, which is when CASCADE finally removes their data.
--
-- HOW TO APPLY
--   psql "$DATABASE_URL_UNPOOLED" -X -v ON_ERROR_STOP=1 --single-transaction \
--     -f supabase/migrations/neon/007_user_tombstone.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS user_deleted_at_idx
  ON public."user" (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_auth_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  mirror_is_test boolean;
  mirror_exists  boolean;
BEGIN
  SELECT true, COALESCE(p.is_test, false)
    INTO mirror_exists, mirror_is_test
    FROM public."user" p
   WHERE p.id = OLD.id;

  IF NOT COALESCE(mirror_exists, false) THEN
    RETURN OLD;                                   -- nothing mirrored, nothing to do
  END IF;

  IF mirror_is_test THEN
    -- Throwaway account: no recovery window, remove it and everything it owns.
    DELETE FROM public."user" WHERE id = OLD.id;
  ELSE
    -- Real account: keep the row and its data, mark it gone. Idempotent.
    UPDATE public."user"
       SET deleted_at = now(), updatedat = now()
     WHERE id = OLD.id AND deleted_at IS NULL;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_tombstoned_user(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  changed int;
BEGIN
  UPDATE public."user"
     SET deleted_at = NULL, updatedat = now()
   WHERE id = p_id AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.sync_auth_user_delete() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.restore_tombstoned_user(uuid) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_delete() FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.restore_tombstoned_user(uuid) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_delete() FROM anonymous';
    EXECUTE 'REVOKE ALL ON FUNCTION public.restore_tombstoned_user(uuid) FROM anonymous';
  END IF;
END $$;

-- §5 verification: the invariants this file must not break.
DO $$
DECLARE
  unmirrored int;
  live_orphans int;
BEGIN
  SELECT count(*) INTO unmirrored
    FROM neon_auth."user" a
   WHERE NOT EXISTS (SELECT 1 FROM public."user" p WHERE p.id = a.id);
  IF unmirrored > 0 THEN
    RAISE EXCEPTION '007: % auth identit(ies) have no public."user" mirror', unmirrored;
  END IF;

  -- An orphan is now legal ONLY as a tombstone.
  SELECT count(*) INTO live_orphans
    FROM public."user" p
   WHERE p.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM neon_auth."user" a WHERE a.id = p.id);
  IF live_orphans > 0 THEN
    RAISE EXCEPTION '007: % live (non-tombstoned) public."user" row(s) have no auth identity', live_orphans;
  END IF;

  RAISE NOTICE '007 applied: tombstones enabled, 0 unmirrored, 0 live orphans';
END $$;

COMMIT;
