-- ─────────────────────────────────────────────────────────────────────
-- 010_constellation_foundation.sql — Constellations + Chronicle data
-- foundation (B-19). Widen completion_events, add index. NO rank table —
-- the rank ladder is derived in TS (bands live in code, no DB drift).
--
-- Design source: docs/system-architecture-constellations.md
-- Contract types:  src/shared/contracts-constellations.ts
--                   (steel also WIDENS CompletionEventRow in
--                    src/shared/contracts-course-catalog.ts to match)
--
-- Owner: brainiac (arch). Applies: steel (build sub-task A).
-- ─────────────────────────────────────────────────────────────────────

-- 1. Widen completion_events.event_type CHECK.
--    Postgres cannot ALTER an inline CHECK in place — drop + re-add with the
--    new membership. The inline CHECK from migration 009 inherited the
--    auto-generated default name `completion_events_event_type_check`.
alter table public.completion_events
  drop constraint if exists completion_events_event_type_check;

alter table public.completion_events
  add constraint completion_events_event_type_check
  check (event_type in ('lesson', 'course', 'quiz', 'exam', 'certificate'));

-- 2. Optional jsonb envelope for quiz/exam/certificate events (tier/score).
--    Existing lesson/course rows stay NULL — purely additive, backward compat.
alter table public.completion_events
  add column if not exists metadata jsonb;

-- 3. Supporting indexes. The primary read (per user, time-ordered) is already
--    served by completion_events_user_time_idx (009). Add an event-kind filter
--    index for surface queries that bucket by event_type (chronicle feed,
--    sky loader) without scanning every row.
create index if not exists completion_events_user_type_idx
  on public.completion_events (user_id, event_type);

-- 4. RLS — NO change required. The existing select-own / insert-own policies
--    (009) are scoped on user_id, not event_type, so the three new event kinds
--    and the metadata column inherit identical ownership enforcement:
--      select: own-or-admin  |  insert: own  |  update/delete: none.
--    The server seam (appendCompletionEvent via anon/JWT client, best-effort
--    idempotent) stays the only writer. The metadata envelope is never
--    client-supplied on insert — it is derived server-side at each write site,
--    consistent with the F1/no-forge discipline in the quiz/lesson routes.

-- ─────────────────────────────────────────────────────────────────────
-- NO rank table, NO denormalized streak/completion columns. Streak, rank,
-- longest streak and time-to-complete are derived purely in
-- src/lib/completion.ts deriveProgress() from the append-only log (ADR-211 /
-- ADR-212 spirit) so there is no drifting counter state to keep in sync.
-- The 'certificate' event is the single, queryable record of eligibility
-- (idempotent — one row per (user, course) per event_type).
-- ─────────────────────────────────────────────────────────────────────