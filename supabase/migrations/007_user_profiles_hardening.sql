-- Migration: 007_user_profiles_hardening.sql
-- Purpose: Harden user_profiles RLS to the project's migration-003 standard.
--   Closes Val-El's audit findings t_6cd3026f (fresh re-audit of user_profiles):
--     F1 (LOW, CWE-732): UPDATE policy omits explicit WITH CHECK — PG falls back
--        to USING for the new-row check, but an explicit WITH CHECK prevents
--        silent widening if USING is ever loosened.
--     F2 (LOW, CWE-285): all three policies omit TO authenticated — auth.uid()
--        is NULL for anon so anon is already denied, but an explicit role
--        narrows future blast radius.
--   Matches migration-003 pattern (003_security_hardening.sql, I3/F2/F3).
--   user_id FK already REFERENCES auth.users(id) ON DELETE CASCADE (migration 005,
--   line 8), so no FK change is required here.
--
-- Layered on top of 005_user_profiles.sql. Migration 005 is already applied
-- (live per audit t_6cd3026f), so DO NOT edit it — recreate its policies here.
-- Date: 2026-08-12
-- Architecture reference: brainiac t_4ce88f5c — per 003 pattern.

-- =====================================================================
-- user_profiles
-- =====================================================================

DROP POLICY IF EXISTS "users select own profile" ON user_profiles;
CREATE POLICY "users select own profile"
  ON user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users upsert own profile" ON user_profiles;
CREATE POLICY "users upsert own profile"
  ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own profile" ON user_profiles;
CREATE POLICY "users update own profile"
  ON user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
