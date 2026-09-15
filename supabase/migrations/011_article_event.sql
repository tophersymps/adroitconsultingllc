-- ─────────────────────────────────────────────────────────────────────
-- 011_article_event.sql — G1: widen completion_events.event_type to
-- include 'article' (profile-galaxy free-floating stars from blog reads).
--
-- Design source: docs/arch-immersive-3d.md (G1) + ADR-304
-- Contract types:  src/shared/contracts-constellations.ts
--                   (CompletionEventType already widened with 'article')
-- Owner: brainiac (arch). Applies: steel (build sub-task G1).
--
-- This is a follow-up migration because it touches a LIVE CHECK constraint.
-- It is additive: existing rows are untouched, and the write site
-- (POST /api/progress/read for contentType='blog') appends one 'article'
-- event per (user, blog slug), idempotent via appendCompletionEvent.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Widen completion_events.event_type CHECK to include 'article'.
--    Postgres cannot ALTER an inline CHECK in place — drop + re-add with the
--    new membership (same pattern as migration 010).
alter table public.completion_events
  drop constraint if exists completion_events_event_type_check;

alter table public.completion_events
  add constraint completion_events_event_type_check
  check (event_type in ('lesson', 'course', 'quiz', 'exam', 'certificate', 'article'));

-- 2. RLS — NO change required. The existing select-own / insert-own policies
--    (009) are scoped on user_id, not event_type, so the 'article' event
--    inherits identical ownership enforcement. The server seam
--    (appendCompletionEvent via anon/JWT client, best-effort idempotent)
--    stays the only writer.

-- ─────────────────────────────────────────────────────────────────────
-- NOTE: run this migration ONLY together with the write site
-- (POST /api/progress/read appending 'article' events for blog reads).
-- Until both land, the profile galaxy falls back gracefully to zero
-- article stars (galaxy-model.ts already sources from event_type='article').
-- ─────────────────────────────────────────────────────────────────────
