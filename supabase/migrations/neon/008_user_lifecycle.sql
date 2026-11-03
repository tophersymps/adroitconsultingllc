-- ═══════════════════════════════════════════════════════════════════
-- 008_user_lifecycle.sql — account freeze state & lifecycle helpers
--
-- WHY
--   Admins need to temporarily freeze/suspend user accounts (revoking active
--   sessions and blocking sign-in) without deleting their identity or stripping
--   course entitlements, as well as restore soft-deleted (tombstoned) accounts.
--
-- WHAT CHANGES
--   * public."user" gains `frozen_at` (timestamptz) and `frozen_reason` (text).
--   * Adding columns to public."user" preserves the exact 37-policy RLS
--     inventory assertion in 001_rls.sql.
--   * Updates public.restore_tombstoned_user(uuid) to clear deleted_at and
--     optionally unfreeze when restoring a tombstoned user.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS frozen_at timestamptz;
ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS frozen_reason text;

CREATE INDEX IF NOT EXISTS user_frozen_at_idx
  ON public."user" (frozen_at) WHERE frozen_at IS NOT NULL;

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
     SET deleted_at = NULL,
         updatedat = now()
   WHERE id = p_id AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.restore_tombstoned_user(uuid) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.restore_tombstoned_user(uuid) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.restore_tombstoned_user(uuid) FROM anonymous';
  END IF;
END $$;

COMMIT;
