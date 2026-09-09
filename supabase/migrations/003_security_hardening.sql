-- Migration: 003_security_hardening.sql
-- Purpose: Harden RLS posture from security audits t_ea38d052 (RLS) + t_4ee14a75 (auth).
-- Layered on top of 001 (tables) + 002 (quiz dedupe) — do NOT edit applied migrations.
-- Date: 2026-08-06

-- 1) Explicit WITH CHECK on every UPDATE policy (RLS audit F2 / I3).
--    PostgreSQL falls back to USING when WITH CHECK is omitted, but an
--    explicit guard prevents silent widening if USING is ever loosened.
--
-- 2) TO authenticated on all policies (RLS audit F3 / I3).
--    Previously policies defaulted to PUBLIC; the auth.uid() expression still
--    denied anon, but an explicit role narrows future blast radius.
--
-- 3) REFERENCES auth.users(id) ON DELETE CASCADE (RLS audit F4 / I3).
--    Removes orphaned progress rows when a user account is deleted.

-- =====================================================================
-- read_progress
-- =====================================================================

DROP POLICY IF EXISTS "Users can view their own read progress" ON read_progress;
CREATE POLICY "Users can view their own read progress"
  ON read_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own read progress" ON read_progress;
CREATE POLICY "Users can insert their own read progress"
  ON read_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own read progress" ON read_progress;
CREATE POLICY "Users can update their own read progress"
  ON read_progress FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own read progress" ON read_progress;
CREATE POLICY "Users can delete their own read progress"
  ON read_progress FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE read_progress
  DROP CONSTRAINT IF EXISTS fk_read_progress_user;
ALTER TABLE read_progress
  ADD CONSTRAINT fk_read_progress_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- =====================================================================
-- lesson_completion
-- =====================================================================

DROP POLICY IF EXISTS "Users can view their own lesson completion" ON lesson_completion;
CREATE POLICY "Users can view their own lesson completion"
  ON lesson_completion FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own lesson completion" ON lesson_completion;
CREATE POLICY "Users can insert their own lesson completion"
  ON lesson_completion FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lesson completion" ON lesson_completion;
CREATE POLICY "Users can update their own lesson completion"
  ON lesson_completion FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own lesson completion" ON lesson_completion;
CREATE POLICY "Users can delete their own lesson completion"
  ON lesson_completion FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE lesson_completion
  DROP CONSTRAINT IF EXISTS fk_lesson_completion_user;
ALTER TABLE lesson_completion
  ADD CONSTRAINT fk_lesson_completion_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- =====================================================================
-- quiz_attempt
-- =====================================================================

DROP POLICY IF EXISTS "Users can view their own quiz attempts" ON quiz_attempt;
CREATE POLICY "Users can view their own quiz attempts"
  ON quiz_attempt FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own quiz attempts" ON quiz_attempt;
CREATE POLICY "Users can insert their own quiz attempts"
  ON quiz_attempt FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own quiz attempts" ON quiz_attempt;
CREATE POLICY "Users can update their own quiz attempts"
  ON quiz_attempt FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own quiz attempts" ON quiz_attempt;
CREATE POLICY "Users can delete their own quiz attempts"
  ON quiz_attempt FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE quiz_attempt
  DROP CONSTRAINT IF EXISTS fk_quiz_attempt_user;
ALTER TABLE quiz_attempt
  ADD CONSTRAINT fk_quiz_attempt_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
