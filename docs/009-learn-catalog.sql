-- ═══════════════════════════════════════════════════════════════════
-- 009_learn_catalog.sql — Learn Platform v2: Organization as Data +
-- Catalog Contract + Course Profile + Completion Foundation (PLATFORM)
-- Task t_e6b81ca5 (brainiac arch) · implementer steel t_73759dd5 · 2026-08-27
--
-- APPROVED PLAN: ~/.hermes/plans/hermes-consultant-track-intermediate-advanced.md
-- Arch doc:      docs/system-architecture-learn-v2.md / .html
-- Contracts:     src/shared/contracts-course-catalog.ts (reopened by brainiac)
-- Design input:  design/t_cffa75b8/ (kara design-system-learn-v2.css + mockups)
--
-- WHAT THIS MIGRATION ADDS (supersedes bucketOf() regex + series.json group/subgroup):
--  1. catalog_sections  — top-level sections: Certifications / Tracks / Learning Paths.
--  2. catalog_groups    — groups under a section (Salesforce Certifications, Hermes
--                         Consultant Track, future AWS Certifications = one DB row).
--  3. courses NEW columns — ORG fields (section_id, group_id, track, level, sort_order)
--     + PROFILE fields (difficulty, recommended_background, audience,
--     learning_outcomes, course_tags). ALL org + profile fields leave series.json.
--  4. course_prerequisites — structured "this course requires course X" join table.
--  5. completion_events — append-only completion foundation (powers V2 Constellations/
--     Chronicle). Record now; visual layer = V2.
--  6. Next-course seam — DERIVED from track/level/sort_order (no redundant table;
--     see ADR-212). V2 escape hatch: optional course_next override table.
--
-- BACKWARD COMPATIBILITY (constraint from scope): every new courses column is
-- NULLABLE / defaulted. Existing rows keep NULL in new columns. No column is
-- dropped or made NOT NULL. series.json display fields (name/description/gradient)
-- are untouched and remain the content team's contribution.
--
-- RLS MODEL (ADR-202 defense-in-depth, same as migration 008):
--   - catalog_sections / catalog_groups / course_prerequisites : SELECT public
--     (organizational + prerequisite metadata is non-sensitive), write admin-only.
--   - courses (new cols ride the existing courses RLS): live public, admin write.
--   - completion_events: SELECT own-or-admin, INSERT own, NO update/delete
--     (append-only). Scoped to owner (ADR-211).
--   - admin_audit_log: new admin mutations (catalog upserts, profile edits,
--     prerequisite changes) write audit rows — same table, no schema change.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. catalog_sections — top-level Learn sections (Certifications / Tracks /
--    Learning Paths). Adding a new section = one DB row, no code change.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.catalog_sections (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,            -- 'certifications' | 'tracks' | 'learning-paths'
  name       text not null,                   -- display: 'Certifications', 'Tracks', 'Learning Paths'
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. catalog_groups — a vendor/family group under a section. One row per
--    group; new cert vendor or track = one row, zero code change.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.catalog_groups (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.catalog_sections(id) on delete cascade,
  slug       text not null unique,            -- 'salesforce-certifications' | 'hermes-consultant-track' | 'aws-certifications'
  name       text not null,                   -- display: 'Salesforce Certifications', 'Hermes Consultant Track'
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  constraint catalog_groups_section_slug unique (section_id, slug)
);

-- ─────────────────────────────────────────────────────────────────────
-- 3. courses — ADD org + profile columns. ALL nullable (backward compat).
--    This is the unified "organization + profile as data" source of truth.
--    series.json keeps ONLY name/description/gradient after this.
-- ─────────────────────────────────────────────────────────────────────

-- ORG fields (replaces series.json group/subgroup + LearnFilters bucketOf regex)
alter table public.courses
  add column if not exists section_id uuid references public.catalog_sections(id);
alter table public.courses
  add column if not exists group_id   uuid references public.catalog_groups(id);
alter table public.courses
  add column if not exists track      text;   -- track slug this course belongs to, e.g. 'hermes-consultant' (NULL = standalone)
alter table public.courses
  add column if not exists level      int;    -- 1|2|3 within a track (NULL = standalone / Learning Path)
alter table public.courses
  add column if not exists sort_order int not null default 0;  -- order within group/track

-- PROFILE fields (content-authored profile moves into the DB per arch; admin form owns them)
alter table public.courses
  add column if not exists difficulty text
    check (difficulty in ('Beginner', 'Intermediate', 'Advanced'));
alter table public.courses
  add column if not exists recommended_background text;   -- prose, e.g. "comfortable with the command line and basic Python"
alter table public.courses
  add column if not exists audience text;                -- who it's for: Consultants, Developers, PMs, Cert candidates...
alter table public.courses
  add column if not exists learning_outcomes jsonb;      -- array of 2-4 strings: "what you'll be able to do after"
alter table public.courses
  add column if not exists course_tags text[];           -- course-level tags, distinct from per-lesson tags

create index if not exists courses_section_idx on public.courses(section_id);
create index if not exists courses_group_idx   on public.courses(group_id);
create index if not exists courses_track_idx   on public.courses(track);

-- ─────────────────────────────────────────────────────────────────────
-- 4. course_prerequisites — structured "this course requires course X".
--    Self-referencing join on courses. Enables later "unlock Level 2 after
--    Level 1" gating (V2 Option B) AND auto-renders the Prerequisites section
--    on the course outline now (no code per prerequisite — just rows).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.course_prerequisites (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete cascade,
  required_course_id uuid not null references public.courses(id) on delete cascade,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  constraint prereq_not_self check (course_id <> required_course_id),
  constraint course_prerequisites_unique unique (course_id, required_course_id)
);

create index if not exists course_prerequisites_course_idx on public.course_prerequisites(course_id);
create index if not exists course_prerequisites_required_idx on public.course_prerequisites(required_course_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. completion_events — append-only completion foundation. One row per
--    lesson completion (and a 'course' row when the last lesson completes).
--    Powers V2 Constellations + Chronicle (streaks, time-to-complete, rank
--    ladder) WITHOUT schema change. The existing lesson_completion table
--    (001) stays as the simple current-state store for SeriesProgress /
--    certificate; this log is the timeline/history foundation.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.completion_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    uuid references public.courses(id) on delete set null,
  event_type   text not null default 'lesson' check (event_type in ('lesson', 'course')),
  lesson       int,                              -- lesson number (1-based); NULL for a 'course' event
  lesson_slug  text,                             -- canonical lesson slug; NULL for a 'course' event
  completed_at timestamptz not null default now()
);

create index if not exists completion_events_user_time_idx on public.completion_events(user_id, completed_at);
create index if not exists completion_events_course_idx    on public.completion_events(course_id);

-- ─────────────────────────────────────────────────────────────────────
-- 6. Next-course seam — NO table. Derived at the application seam from
--    (track, level, sort_order) within a track, or from prerequisites for
--    standalone courses (ADR-212). Keep the seam pure in TS so it is unit-
--    testable; a manual course_next override table is the V2 escape hatch if
--    editorial control is ever needed. Do NOT add redundant ordering data.
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 7. RLS policies (defense-in-depth; the server seam is authoritative).
-- ─────────────────────────────────────────────────────────────────────

-- catalog_sections: organizational metadata is public; write admin-only.
alter table public.catalog_sections enable row level security;
drop policy if exists "sections_select_public" on public.catalog_sections;
create policy "sections_select_public"
  on public.catalog_sections for select using (true);
drop policy if exists "sections_admin_write" on public.catalog_sections;
create policy "sections_admin_write"
  on public.catalog_sections for all
  using (public.is_admin())
  with check (public.is_admin());

-- catalog_groups: same model.
alter table public.catalog_groups enable row level security;
drop policy if exists "groups_select_public" on public.catalog_groups;
create policy "groups_select_public"
  on public.catalog_groups for select using (true);
drop policy if exists "groups_admin_write" on public.catalog_groups;
create policy "groups_admin_write"
  on public.catalog_groups for all
  using (public.is_admin())
  with check (public.is_admin());

-- course_prerequisites: SELECT public (outline renders prereqs for anyone);
-- write admin-only.
alter table public.course_prerequisites enable row level security;
drop policy if exists "prereqs_select_public" on public.course_prerequisites;
create policy "prereqs_select_public"
  on public.course_prerequisites for select using (true);
drop policy if exists "prereqs_admin_write" on public.course_prerequisites;
create policy "prereqs_admin_write"
  on public.course_prerequisites for all
  using (public.is_admin())
  with check (public.is_admin());

-- completion_events: SELECT own-or-admin; INSERT own (scoped to owner);
-- NO update/delete policies anywhere → append-only (ADR-211). Even the
-- service client never deletes/updates this table.
alter table public.completion_events enable row level security;
drop policy if exists "completion_events_select_own" on public.completion_events;
create policy "completion_events_select_own"
  on public.completion_events for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists "completion_events_insert_own" on public.completion_events;
create policy "completion_events_insert_own"
  on public.completion_events for insert
  with check (auth.uid() = user_id);

-- NOTE: courses RLS already covers the new courses columns (live public /
-- admin write from migration 008) — no new courses policies required.

-- ─────────────────────────────────────────────────────────────────────
-- 8. Seeds + backfill — idempotent (safe to re-run).
-- ─────────────────────────────────────────────────────────────────────

-- 8a. Seed the three top-level sections.
insert into public.catalog_sections (slug, name, sort_order) values
  ('certifications', 'Certifications',  10),
  ('tracks',         'Tracks',          20),
  ('learning-paths', 'Learning Paths',  30)
on conflict (slug) do nothing;

-- 8b. Seed groups under their sections.
insert into public.catalog_groups (section_id, slug, name, sort_order)
select s.id, 'salesforce-certifications', 'Salesforce Certifications', 10
from public.catalog_sections s where s.slug = 'certifications'
on conflict (section_id, slug) do nothing;

insert into public.catalog_groups (section_id, slug, name, sort_order)
select s.id, 'hermes-consultant-track', 'Hermes Consultant Track', 10
from public.catalog_sections s where s.slug = 'tracks'
on conflict (section_id, slug) do nothing;

-- 8c. Backfill org + profile for the EXISTING live courses so no NULL org
--     fields remain and the current public catalog renders correctly after
--     the hub restructure. (Backward-compat: the migration still tolerates
--     NULL everywhere; this simply sets real values for known series.)
update public.courses c set
  section_id = s.id,
  group_id   = g.id,
  track      = 'hermes-consultant',
  level      = 1,
  sort_order = 10,
  difficulty = 'Beginner'
from public.catalog_sections s, public.catalog_groups g
where s.slug = 'tracks' and g.slug = 'hermes-consultant-track'
  and c.series_slug = 'hermes-consultant';

update public.courses c set
  section_id = s.id,
  group_id   = g.id,
  track      = 'hermes-consultant',
  level      = 2,
  sort_order = 20,
  difficulty = 'Intermediate'
from public.catalog_sections s, public.catalog_groups g
where s.slug = 'tracks' and g.slug = 'hermes-consultant-track'
  and c.series_slug = 'hermes-consultant-intermediate';

update public.courses c set
  section_id = s.id,
  group_id   = g.id,
  track      = 'hermes-consultant',
  level      = 3,
  sort_order = 30,
  difficulty = 'Advanced'
from public.catalog_sections s, public.catalog_groups g
where s.slug = 'tracks' and g.slug = 'hermes-consultant-track'
  and c.series_slug = 'hermes-consultant-advanced';

update public.courses c set
  section_id = s.id,
  group_id   = g.id,
  sort_order = 10,
  difficulty = 'Intermediate'
from public.catalog_sections s, public.catalog_groups g
where s.slug = 'certifications' and g.slug = 'salesforce-certifications'
  and c.series_slug = 'salesforce-architect';

update public.courses c set
  section_id = s.id,
  group_id   = g.id,
  sort_order = 20,
  difficulty = 'Advanced'
from public.catalog_sections s, public.catalog_groups g
where s.slug = 'certifications' and g.slug = 'salesforce-certifications'
  and c.series_slug = 'omni-studio-cert';

update public.courses c set
  section_id = s.id,
  sort_order = 10,
  difficulty = 'Intermediate'
from public.catalog_sections s
where s.slug = 'learning-paths'
  and c.series_slug = 'agentic-ai';

update public.courses c set
  section_id = s.id,
  sort_order = 20,
  difficulty = 'Beginner'
from public.catalog_sections s
where s.slug = 'learning-paths'
  and c.series_slug = 'ai-at-work';

-- 8d. Seed structured prerequisites for the Hermes Consultant Track
--     (L2 requires L1; L3 requires L2). Enables the outline Prerequisites
--     section + the later "unlock Level 2 after Level 1" gating (V2).
insert into public.course_prerequisites (course_id, required_course_id, sort_order)
select l2.id, l1.id, 10
from public.courses l1, public.courses l2
where l1.series_slug = 'hermes-consultant'
  and l2.series_slug = 'hermes-consultant-intermediate'
on conflict (course_id, required_course_id) do nothing;

insert into public.course_prerequisites (course_id, required_course_id, sort_order)
select l3.id, l2.id, 10
from public.courses l2, public.courses l3
where l2.series_slug = 'hermes-consultant-intermediate'
  and l3.series_slug = 'hermes-consultant-advanced'
on conflict (course_id, required_course_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- 9. Implementer notes (do not execute as SQL):
--   * Apply via `supabase db push` on the feat branch; verify with
--     `npx supabase db lint` + a migration-diff check.
--   * The next-course seam + progress/rank helpers are TS, not SQL —
--     see src/shared/contracts-course-catalog.ts (CatalogNextCourse,
--     ProgressHelpers) and the arch doc §4.
--   * The lesson completion API (/api/progress/lesson) must ALSO append a
--     completion_events row when a lesson is marked complete (append-only),
--     and a 'course' event when the last lesson completes.
-- ─────────────────────────────────────────────────────────────────────
