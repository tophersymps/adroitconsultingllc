-- Migration: 001_create_progress_tables.sql
-- Purpose: Create progress tracking tables for blog/lesson reading, lesson completion, and quiz attempts
-- Date: 2026-08-06
-- Architecture reference: brainiac t_718bb3ca implementation plan

-- Table: read_progress
-- Tracks which blog posts and lessons a user has read
CREATE TABLE IF NOT EXISTS read_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('blog', 'lesson')),
  content_slug text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_content UNIQUE (user_id, content_slug)
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_read_progress_user_id ON read_progress (user_id);

-- Table: lesson_completion
-- Tracks which lessons a user has completed
CREATE TABLE IF NOT EXISTS lesson_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_slug text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_lesson UNIQUE (user_id, lesson_slug)
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_lesson_completion_user_id ON lesson_completion (user_id);

-- Table: quiz_attempt
-- Stores individual quiz answer attempts (ephemeral but syncable for auth users)
CREATE TABLE IF NOT EXISTS quiz_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_name text NOT NULL,
  question_index int NOT NULL,
  correct_answer_index int NOT NULL,
  user_answer_index int NOT NULL,
  is_correct boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Index for faster lookups by user and quiz
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_user_id ON quiz_attempt (user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_quiz_name ON quiz_attempt (quiz_name);

-- Row Level Security (RLS) Policies
-- Each user can only access their own data

-- read_progress policies
ALTER TABLE read_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own read progress"
  ON read_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own read progress"
  ON read_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own read progress"
  ON read_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own read progress"
  ON read_progress FOR DELETE
  USING (auth.uid() = user_id);

-- lesson_completion policies
ALTER TABLE lesson_completion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lesson completion"
  ON lesson_completion FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lesson completion"
  ON lesson_completion FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lesson completion"
  ON lesson_completion FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lesson completion"
  ON lesson_completion FOR DELETE
  USING (auth.uid() = user_id);

-- quiz_attempt policies
ALTER TABLE quiz_attempt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quiz attempts"
  ON quiz_attempt FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quiz attempts"
  ON quiz_attempt FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz attempts"
  ON quiz_attempt FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quiz attempts"
  ON quiz_attempt FOR DELETE
  USING (auth.uid() = user_id);
