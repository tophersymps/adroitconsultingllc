-- Migration: 005_user_profiles.sql
-- Purpose: Per-account profile row — display name, username, theme preference.
--   Lazily upserted on first profile read/API call (no row on signup).
-- Date: 2026-08-11
-- Architecture reference: brainiac t_cde0e74a (Round 3) — docs/system-architecture-account-round3.md §3.1

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  username     text,
  theme_pref   text NOT NULL DEFAULT 'system'
               CHECK (theme_pref IN ('system', 'light', 'dark')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS: a user can only read/upsert/update their own row.
CREATE POLICY "users select own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users upsert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);
