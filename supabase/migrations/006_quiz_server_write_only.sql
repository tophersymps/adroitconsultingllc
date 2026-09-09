-- Migration: 006_quiz_server_write_only.sql
-- Purpose: Make quiz_run / quiz_attempt SERVER-WRITE-ONLY. Close the RLS
--   client-forge path (CWE-807) where an authenticated client could hit
--   PostgREST directly with the anon key + user JWT and INSERT/UPDATE/DELETE
--   forged rows (quiz_attempt.is_correct / quiz_run.score) — bypassing the
--   Next.js API routes that recompute correctness server-side — to unlock
--   the timed exam or grant a certificate without earning them.
--
--   The Next.js API routes (POST /api/progress/quiz, /quiz/run, /quiz/batch)
--   are the ONLY legitimate write path: they validate input, recompute
--   correctness from the canonical quiz JSON, and grade the exam. Those
--   routes now write via the service_role key, which carries the Postgres
--   `BYPASSRLS` attribute and therefore ignores RLS — so removing the
--   client write policies does not block the server.
--
--   SELECT is preserved for the `authenticated` role so users can still
--   read their OWN quiz_run stats and graded quiz_attempt rows (the
--   run/stats GET routes, tiers rollup, exam page, and certificate page all
--   read — never write — these tables). `anon` was never granted access and
--   keeps none.
--
-- Layered on top of 001 (tables) + 002 (quiz dedupe) + 003 (RLS hardening)
-- + 004 (quiz_run). Do NOT edit applied migrations.
-- Date: 2026-08-11
-- Architecture reference: brainiac t_bb6ed113 — defense-in-depth on top of
--   t_7469e31d (route recomputes score from graded attempts) + t_57dad207 F1.

-- =====================================================================
-- quiz_attempt — revoke client INSERT / UPDATE / DELETE (keep SELECT)
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert their own quiz attempts" ON quiz_attempt;
DROP POLICY IF EXISTS "Users can update their own quiz attempts" ON quiz_attempt;
DROP POLICY IF EXISTS "Users can delete their own quiz attempts" ON quiz_attempt;

-- Explicit deny guards (defense-in-depth): even if a permissive policy is
-- ever re-added for `authenticated`, these still force every client write to
-- be rejected. Writes require service_role (server API routes only).
CREATE POLICY "quiz_attempt deny client insert"
  ON quiz_attempt FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "quiz_attempt deny client update"
  ON quiz_attempt FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "quiz_attempt deny client delete"
  ON quiz_attempt FOR DELETE TO authenticated
  USING (false);

-- =====================================================================
-- quiz_run — revoke client INSERT (keep SELECT)
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert their own quiz runs" ON quiz_run;

CREATE POLICY "quiz_run deny client insert"
  ON quiz_run FOR INSERT TO authenticated
  WITH CHECK (false);
