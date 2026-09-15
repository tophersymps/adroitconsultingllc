-- Migration: 012_completion_events_server_write_only.sql
-- Purpose: Make completion_events SERVER-WRITE-ONLY. Close the RLS
--   client-forge path (CWE-807) where an authenticated client could hit
--   PostgREST directly with the anon key + user JWT and INSERT forged
--   completion rows for ITSELF with any event_type (lesson/course/quiz/
--   exam/certificate), course_id, lesson slugs, metadata, or completed_at —
--   bypassing the Next.js API routes that decide milestones server-side —
--   to earn certificates, light constellations, or inflate streaks/ranks
--   without doing the work.
--
--   The application write path (appendCompletionEvent in src/lib/completion.ts)
--   is the ONLY legitimate write path: it validates input, applies the
--   idempotency guard, and runs inside server-side API routes. That path now
--   writes via the service_role key, which carries the Postgres `BYPASSRLS`
--   attribute and therefore ignores RLS — so removing the client INSERT policy
--   does not block the server.
--
--   SELECT is preserved for the `authenticated` role so users can still read
--   their OWN completion rows (profile sky, streaks, rank, certificate page,
--   prerequisites gate all READ — never write — this table). `anon` was never
--   granted access and keeps none.
--
-- Layered on top of 009 (table + policies). Do NOT edit applied migrations.
-- Date: 2026-09-08
-- Security: val-el audit t_0a1bd35a finding M2; closes the same class that
--   migration 006 already closed for quiz_run / quiz_attempt.

-- =====================================================================
-- completion_events — revoke client INSERT (keep SELECT)
-- =====================================================================

DROP POLICY IF EXISTS "completion_events_insert_own" ON public.completion_events;

-- Explicit deny guard (defense-in-depth): even if a permissive INSERT policy
-- is ever re-added for `authenticated`, this still forces every client write
-- to be rejected. Writes require service_role (server API routes only).
CREATE POLICY "completion_events deny client insert"
  ON public.completion_events FOR INSERT TO authenticated
  WITH CHECK (false);

-- SELECT for the user's OWN rows is unchanged (migration 009 kept it); no
-- update/delete policies exist anywhere, so the table stays append-only.
