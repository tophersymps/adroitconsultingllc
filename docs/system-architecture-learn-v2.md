# Adroit Learn — Learn Platform v2: Scalable Catalog Schema + Unified Contract

**Task:** t_e6b81ca5 · **Author:** brainiac (architect) · **Date:** 2026-08-27
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Approved plan:** `~/.hermes/plans/hermes-consultant-track-intermediate-advanced.md` (Chris-approved)
**Design inputs:** kara discovery/execution t_cffa75b8 (`design/t_cffa75b8/design-tokens-learn-v2.css`, mockups)
**Contract types:** `src/shared/contracts-course-catalog.ts` (reopened — tsc-clean, verified)
**DB design:** `docs/009-learn-catalog.sql`
**Handoff to:** steel (implementation task t_73759dd5) → QA t_403ad9ad · a11y t_c1e76ada · security t_4fbe922b

---

## 1. Architecture Summary

Learn Platform v2 rebuilds the catalog on a **once-and-done structure**: organization and
course profile become **data** (DB rows), and one **unified `CatalogCourse` contract** feeds
every surface. It replaces the `LearnFilters.bucketOf()` regex + `series.json` `group`/`subgroup`
split with real tables (`catalog_sections`, `catalog_groups`) and moves **all** org + profile
fields out of `series.json` into `courses`. `series.json` keeps only pure display
(name/description/gradient, plus optional `curriculumLessons` for a stable
course size) — the content team's contribution. A `completion_events` append-only
log is the foundation for the V2 Constellations + Chronicle achievement system.

**Non-negotiable (plan):** organization as data — adding a new cert vendor or track is **one DB
row**, zero code change. Content (files) and platform (DB) stay disjoint in the repo so Daily
Planet and Kanban never collide in git.

### What stays, what goes, what's rewritten

| Surface | Stays | Goes / rewritten |
|---|---|---|
| `courses` table (008) | lifecycle + access model | extended with 11 new org/profile columns (009) |
| `src/lib/access.ts` seam | the authoritative gate | loader extended for org rows; feeds the new catalog builder |
| `LearnFilters.bucketOf()` | — | **removed** — bucketing from `catalog_sections`/`catalog_groups` |
| `series.json` | name/description/gradient + optional `curriculumLessons` | `group`/`subgroup` removed (moved to DB) |
| `src/data/learn.ts` (build output) | content display + lesson counts | no org fields read from series.json |
| `lesson_completion` (001) | current-state store (SeriesProgress/cert) | unchanged; `completion_events` added alongside |

---

## 2. Data Model — Supabase (migration 009)

Full SQL in `docs/009-learn-catalog.sql`. Summary:

### 2.1 `catalog_sections`
```sql
id uuid PK, slug text UNIQUE, name text, sort_order int default 0, created_at
```
Three seeded rows: `certifications` (10), `tracks` (20), `learning-paths` (30). **RLS:** SELECT
public; write admin-only (`is_admin()`).

### 2.2 `catalog_groups`
```sql
id uuid PK, section_id uuid FK→catalog_sections, slug text UNIQUE, name text,
sort_order int, created_at, UNIQUE(section_id, slug)
```
Seeded: `salesforce-certifications` (under Certifications), `hermes-consultant-track` (under
Tracks). Future `aws-certifications` = one row. **RLS:** SELECT public; write admin-only.

### 2.3 `courses` — 11 new columns (ALL nullable → backward compatible)
- **Org:** `section_id` FK, `group_id` FK, `track` text, `level` int, `sort_order` int.
- **Profile:** `difficulty` text CHECK(Beginner|Intermediate|Advanced),
  `recommended_background` text, `audience` text, `learning_outcomes` jsonb, `course_tags` text[].
- Indexes on `section_id`, `group_id`, `track`.
- Existing rows: backfilled to real sections/groups/track/level/difficulty (idempotent seed, §8).
- **RLS:** no new policies — the existing `courses` policies (live public / admin write) cover
  the new columns.

### 2.4 `course_prerequisites` — structured "requires X"
```sql
id uuid PK, course_id uuid FK→courses, required_course_id uuid FK→courses,
sort_order int, created_at, CHECK(course_id <> required_course_id), UNIQUE(course_id, required_course_id)
```
Self-referencing join. Enables the outline **Prerequisites section** now and the V2
"unlock Level 2 after Level 1" gating later — no code per prerequisite, just rows.
**RLS:** SELECT public (outline renders prereqs for anyone); write admin-only.

### 2.5 `completion_events` — append-only foundation
```sql
id bigint identity PK, user_id uuid FK→auth.users, course_id uuid FK→courses,
event_type text CHECK(lesson|course), lesson int, lesson_slug text, completed_at
```
- One row per lesson completion (and a `course` event when the last lesson completes).
- Indexes on `(user_id, completed_at)` and `course_id`.
- **RLS:** SELECT own-or-admin; **INSERT own only**; **NO update/delete policies anywhere →
  append-only (ADR-211)**. Even the service client never deletes.
- The existing `lesson_completion` table (001) stays as the simple current-state store
  (SeriesProgress/certificate); `completion_events` is the timeline/history foundation.

### 2.6 Next-course seam — derived, no table (ADR-212)
`course_next` is **not** a table. Next-course is derived from `(track, level, sort_order)`
within a track, or from `course_prerequisites` for standalone courses. A pure TS helper
(`getNextCourse`) computes it; a manual `course_next` override table is the V2 escape hatch
only if editorial control is ever needed. No redundant ordering data to drift.

---

## 3. Unified Catalog Contract — `src/shared/contracts-course-catalog.ts`

One **`CatalogCourse`** type (ADR-210) merges DB-derived org/profile/access with content-derived
display. Every surface consumes it — no drift.

```ts
interface CatalogCourse {
  course: CourseRow;                 // DB: status/access + 11 new org/profile columns
  section: CatalogSection | null;    // joined section
  group: CatalogGroup | null;        // joined group
  prerequisites: PrerequisiteCourse[]; // structured "requires X"
  nextCourseId: string | null;       // derived next (ADR-212)
  name: string; description: string; gradient: string;  // from series.json
  lessonCount: number; totalLessons: number;            // from lesson files
  curriculumLessons: number;                            // series.json, else totalLessons
  visible: boolean; canAccess: boolean;                 // from access seam
}
```

Supporting types added: `Difficulty`, `CatalogSection`, `CatalogGroup`,
`CoursePrerequisiteRow`, `PrerequisiteCourse`, `CompletionEventRow`, `CatalogOrganization`,
`CatalogNextCourse`, `CompletionInput`, `DerivedProgress`, `CatalogForUserV2Result`, and admin
types (`AdminCourseUpdateRequest` extended, `AdminSectionUpsertRequest`,
`AdminGroupUpsertRequest`, `AdminPrerequisiteRequest`).

### 3a. Access seam changes (`src/lib/access.ts`)

- `CourseRow` now carries org/profile columns (optional → `?? null` on read).
- `PlatformDataLoader` gains `getSections()`, `getGroups()`, `getPrerequisites()`.
- New **`src/lib/catalog.ts`** (recommended) exposes `buildCatalogCourse(course, contentSeries,
  org, prereqs)` → `CatalogCourse`, plus `getCatalogForUserV2(userId)` that composes the seam
  (`getCatalogForUser`) + content (`src/data/learn.ts`) + org + prereqs into
  `CatalogForUserV2Result`. Keeping the merge in `catalog.ts` preserves `access.ts`'s single
  responsibility (access decisions); the seam feeds it.
- Next-course seam: pure `getNextCourse(courses, currentId)` (track order) + `prerequisitesMet`
  (all prereq course_ids completed) — both unit-testable without a DB.

---

## 4. Component Map

**Learn hub restructure (plan §3e):**
- `/learn` (`src/app/learn/page.tsx`) — replace `getAllSeries()`-only flow with
  `getCatalogForUserV2` → bucket by `section`/`group`, group tracks + "Level N" ordering,
  and drive client search/filter. Remove `LearnFilters.bucketOf()`; chips come from
  `catalog_sections`/`catalog_groups` rows.
- `LearnHub.tsx` / `LearnFilters.tsx` — bucketing from DB sections/groups instead of the regex;
  track grouping + "Level N" labels; course search/filter over `CatalogCourse[]`.
- `PathCard` (V2 per kara design) — add `DifficultyPill` + section/group labels + lock state.

**Course profile + outline (plan §3c):**
- `/learn/[series]` outline — render a **Prerequisites section** (structured + recommended
  background), difficulty pill, audience, learning_outcomes, course_tags, and a next-course
  callout (`CatalogNextCourse`).
- `PrerequisitesSection`, `DifficultyPill` components (kara `design-tokens-learn-v2.css`).

**Admin (plan §3c/§3a):**
- `/admin/courses` — course form gains org fields (section/group/track/level/sort_order) +
  profile fields (difficulty/recommended_background/audience/outcomes/tags) + prerequisite
  editor. New admin API routes: section/group upsert, prerequisite mutation.

**Completion foundation (plan §3f):**
- `/api/progress/lesson` — on complete, ALSO append a `completion_events` row (lesson), and a
  `course` event when the last lesson completes.
- `src/lib/progress.ts` (new) — pure `deriveProgress(input: CompletionInput): DerivedProgress`
  (lessons/courses/tracks completed, streak, longest streak, time-to-complete). No visual yet.

**Sitemap / APIs / paywall:** consume `CatalogCourse` so org/access never drift.

---

## 5. Data Flow

```
Build time:
  content/learn/<series>/series.json (name/description/gradient) + lesson files
    → scripts/build-learn.js → src/data/learn.ts (learnSeries)   [no org fields]

Request: /learn
  server component
    → getSupabaseServerClient() (cookie → user)
    → accessSeam.getCatalogForUser(userId)        (live rows, per-user access)
    → loader.getSections() / getGroups() / getPrerequisites()
    → catalog.getCatalogForUserV2(userId)
        → buildCatalogCourse(course, contentSeries, org, prereqs) → CatalogCourse[]
    → LearnHub buckets by section/group, orders tracks by level, renders PathCards

Request: lesson marked complete
  POST /api/progress/lesson
    → canonical slug + access-seam gate (existing)
    → upsert lesson_completion (existing current-state store)
    → INSERT completion_events (append-only log, scoped to owner)

Admin edits course profile
  → /admin/courses → PATCH /api/admin/courses/[slug] (org + profile fields)
  → update courses row (service client)
  → admin_audit_log (course.profile_change) — ADR-205
```

---

## 6. Implementation Steps (for steel)

> Branch-based: push a `feat/learn-v2-catalog` branch + open PR (main is branch-protected).
> Apply migration 009 via `supabase db push`. Do NOT touch blog article gating.

1. **Migration 009** — create `catalog_sections`, `catalog_groups`, `course_prerequisites`,
   `completion_events`; ALTER `courses` add 11 columns; indexes; RLS; seeds + backfill.
   Copy from `docs/009-learn-catalog.sql`. Verify `npx supabase db lint` + migration applied.
2. **Contracts** — already updated (`src/shared/contracts-course-catalog.ts`, tsc-clean).
   Import from it; do not edit.
3. **`build-learn.js`** — stop reading `group`/`subgroup` from series.json (org now from DB).
   Keep name/description/gradient.
4. **Access seam + catalog builder** — extend `PlatformDataLoader` (getSections/getGroups/
   getPrerequisites); add `src/lib/catalog.ts` (`buildCatalogCourse`, `getCatalogForUserV2`,
   `getNextCourse`, `prerequisitesMet`) + unit tests.
5. **Learn hub restructure** — `/learn` via `getCatalogForUserV2`; remove `bucketOf()`;
   section/group chips; track grouping + "Level N"; search/filter.
6. **Course profile + outline** — render Prerequisites section, difficulty/audience/outcomes/
   tags on `/learn/[series]`; new components (kara tokens).
7. **Admin** — extend course form + PATCH route (org/profile/prereqs); section/group upsert
   routes; audit each mutation.
8. **Completion foundation** — append `completion_events` in `/api/progress/lesson`;
   `src/lib/progress.ts` `deriveProgress` + tests.
9. **Tests** — hub bucketing, catalog contract merge, completion append + derivation, admin
   round-trip, RLS (raw client can't read others' events). `npm run build` + `npm test` clean.
10. **Hand off** — QA (t_403ad9ad) against the acceptance criteria below; a11y (t_c1e76ada);
    security (t_4fbe922b).

---

## 7. ADRs

| ID | Title | Decision | Context | Consequences |
|----|-------|----------|---------|--------------|
| ADR-206 | Org as data | `catalog_sections` + `catalog_groups` tables; all org fields on `courses` | bucketOf() regex + series.json group/subgroup don't scale to new vendors/tracks | Adding a cert vendor/track = one DB row, zero code change; org is queryable |
| ADR-207 | series.json = display only | keep only name/description/gradient in files; org+profile in DB | Content team authors in parallel without platform deploys | Content and platform touch disjoint dirs; no field double-claim |
| ADR-208 | Course profile as DB columns | difficulty/recommended_background/audience/outcomes/tags on `courses` | Profile must render on outlines + be admin-editable + power filters | Admin form owns profile; content team no longer authors org |
| ADR-209 | Structured prerequisites join | `course_prerequisites` self-referencing join | Auto-render Prerequisites + enable V2 gating without per-course code | Prereqs queryable; V2 "unlock Level 2" built on rows, not hardcode |
| ADR-210 | Unified catalog contract | one `CatalogCourse` merged type for every surface | Hub/cards/paywall/admin/sitemap/APIs drifted before | Single builder (`buildCatalogCourse`); no drift; surfaces stay thin |
| ADR-211 | Append-only completion log | `completion_events` insert-only, scoped to owner | Chronicle/streaks/time-to-complete need an immutable timeline | No updates/deletes; RLS insert-own; current state stays in lesson_completion |
| ADR-212 | Next-course seam derived | no `course_next` table; derive from track/level/sort_order + prereqs | Avoid redundant ordering data that can drift | Pure TS helper; manual override table is a V2 escape hatch |

---

## 8. Acceptance Criteria (for zod / QA)

Derived from the approved plan (owner: brainiac per BA-drop note).

**Org as data**
1. `catalog_sections` has Certifications / Tracks / Learning Paths; `catalog_groups` has
   Salesforce Certifications + Hermes Consultant Track — all seeded by migration 009.
2. Every existing live course has a non-null `section_id` (+ `group_id` where applicable)
   after the backfill — no uncategorized public courses.
3. `bucketOf()` regex is gone; hub buckets purely from section/group rows.

**Unified contract**
4. `buildCatalogCourse` merges DB org/profile + content name/description/gradient + lesson
   counts + access into one `CatalogCourse`; standalone (Learning Path) courses render
   correctly with section but no group.
5. Every surface (hub, cards, paywall, admin, sitemap, APIs) consumes `CatalogCourse` — no
   surface reads series.json org fields directly.

**Course profile**
6. Course outline renders a Prerequisites section (structured + recommended_background),
   difficulty pill, audience, outcomes, and tags.
7. Difficulty is one of Beginner/Intermediate/Advanced and appears on every course.
8. Admin course form round-trips org + profile + prerequisite fields (save → re-read → match).

**Tracks + next-course**
9. Hermes Consultant Track courses group under "Hermes Consultant Track" with Level 1/2/3
   ordering; `getNextCourse` returns L2 after L1, L3 after L2, null after L3.
10. `prerequisitesMet` is true only when all of a course's prerequisites are completed.

**Completion foundation**
11. Marking a lesson complete appends a `completion_events` row; completing the last lesson
    appends a `course` event.
12. `deriveProgress` returns correct lessons/courses/tracks completed, streak, and
    time-to-complete from events.

**Security**
13. RLS: a raw anon client cannot read others' `completion_events`, cannot insert events for
    another user, and cannot update/delete any event (append-only).
14. Non-admin cannot write `catalog_sections`/`catalog_groups`/`course_prerequisites`/`courses`
    org+profile; every admin profile/org/prereq mutation writes an `admin_audit_log` row.
15. Blog article gating is untouched (regression: all existing blog routes stay public).

**Regression**
16. `npm run build` + `npm test` pass; access seam tests still green.

---

## 9. Risks

- **Migration not pushed / RLS misconfigured** → surfaces 500 or leak. Mitigation: apply 009 in
  steel task A, verify policies + seeds, keep the server seam authoritative.
- **Backfill misses a series** → uncategorized course hidden from public org view. Mitigation:
  idempotent seed covers all currently-live series; new series must set org before launch
  (admin form enforces).
- **content-derived name/description/gradient still from files, org from DB** → a rename in
  series.json without DB update is fine (display only); org changes must go through admin.
- **completion_events growth** — append-only, indexed on (user_id, completed_at); fine at blog
  scale; rank/streak derived, not stored, so no denormalized drift.
- **Contract ripple** — 11 new optional columns on `CourseRow`; existing fixtures build partial
  rows, so they stay valid (verified tsc-clean). Downstream reads use `?? null`.
- **Do NOT touch blog article gating** — scope guard; blog routes remain public.

---

## 10. Handoff

- **To steel (t_73759dd5):** migration 009 (docs/009-learn-catalog.sql), contract file
  (src/shared/contracts-course-catalog.ts), access seam + catalog builder, hub restructure,
  course profile + outline, admin form, completion foundation. Implement in the order in §6.
- **Design reference:** kara `design/t_cffa75b8/design-tokens-learn-v2.css` + mockups (hub,
  course outline, chronicle/constellation seam).
- **Content (Daily Planet):** series.json keeps display; content team need not touch org.
