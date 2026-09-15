-- Migration: 002_quiz_attempt_unique.sql
-- Purpose: Dedupe quiz attempts per user/question so an authenticated user
-- cannot grow the quiz_attempt table unboundedly (security audit t_3bbee885 F2).
-- Date: 2026-08-06

-- One latest-attempt row per (user, quiz, question).
-- The API route upserts on this constraint, keeping the newest attempt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempt_user_quiz_question
  ON quiz_attempt (user_id, quiz_name, question_index);
