-- Migration: 004_quiz_run_stats.sql
-- Purpose: Track completed quiz runs so series quiz stats (best score +
-- attempt count, design brief §5.3 / US-005 AC5) can be read back.
-- Layered on top of 001 (tables) + 002 (quiz dedupe) + 003 (RLS hardening).
-- Date: 2026-08-06

-- Table: quiz_run
-- One row per COMPLETED quiz attempt (the whole quiz finished, not per
-- question). Retakes add new rows; best score + attempt count are derived
-- with MAX(score) and COUNT(*). LocalStorage remains the authoritative
-- client copy (ADR-004) — this table backs cross-device stats display.
CREATE TABLE IF NOT EXISTS quiz_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_name text NOT NULL,
  correct int NOT NULL CHECK (correct >= 0),
  total int NOT NULL CHECK (total > 0),
  score int NOT NULL CHECK (score >= 0 AND score <= 100),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_run_user_id ON quiz_run (user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_run_quiz_name ON quiz_run (quiz_name);

-- RLS: users only see their own quiz runs
ALTER TABLE quiz_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quiz runs"
  ON quiz_run FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quiz runs"
  ON quiz_run FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
