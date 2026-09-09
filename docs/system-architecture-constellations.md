# System Architecture — Constellations + Chronicle (B-19 + B-18)

**Tenant:** adroit-blog · **Wave 1**, Phases 4–5
**Architect:** brainiac (task t_3919afe1) · **Pipeline stage → design (kara) → build (steel)**
**Source of truth:** `discovery/consolidated-backlog.md` → "Constellations + Chronicle — feature definition inputs" (§B-18/B-19).

Branded achievement layer: each course is a **constellation** (connected stars, one per lesson, lit as completed), each track a larger pattern; a **Chronicle** (narrative completion log) + **streak/rank** stats sit alongside. The design stub at commit `780fe81` is a direction artifact — the real implementation is a React component driven by `deriveProgress` / `useProgressSummary`.

## Stack

Next.js App Router (existing), TypeScript, server components for `/profile` and the certificate page; client hooks (`useProgressSummary`, new `useAchievement`) + Supabase server client for the log reads. Motion via existing `check-pop` spring `cubic-bezier(0.34,1.56,0.64,1)`; respect `prefers-reduced-motion` (global block already handles it). Tokens keep the stub's additive set (`--constellation-star`, `--constellation-star-lit`, `--constellation-line`, `--chronicle-streak`, `--chronicle-rank-ladder`).

## Build decomposition

B-19 (data foundation) **must land first**; B-18 P1 then P2. Decomposed into four steel sub-tasks (A → B/C parallel → D integrate). Full plan + TS `contract_type_definitions` posted as the `decomposition-plan:` comment on t_3919afe1.

```
A  B-19 data foundation (lock-step contract + streak + rank + 3 write sites)
   ├───────────────┐
B  P1 surfaces     C  P2 surfaces      ← depend on A, run in parallel
   └───────────────┴─────────────────┘
                     D  Integration verify (npm run build = contract gate)
```

## Data model — migration 010 (B-19)

| Change | DDL / shape | Notes |
|---|---|---|
| Widen `event_type` CHECK | drop + re-add constraint `event_type in ('lesson','course','quiz','exam','certificate')` | Postgres can't alter an inline CHECK in place. |
| Add `metadata jsonb` (nullable) | `add column if not exists metadata jsonb` | Existing lesson/course rows stay NULL — backward compatible. |
| Add kind-filter index | `(user_id, event_type)` | Chronicle + sky loader bucket by event type. |
| RLS | **no change** | Existing select-own/insert-own policies scope on `user_id` — new event kinds + metadata inherit them. |
| Rank / streak storage | **none** — derived | Bands live in code (`contracts-constellations.ts` + `deriveProgress`), no drifting DB counters (ADR-211/212 spirit). |

### The 3 write sites (logged via `appendCompletionEvent`, best-effort + idempotent)

1. **Quiz-run** — `POST /api/progress/quiz/run` (route.ts), after the server-graded run inserts: append `{ eventType: 'quiz', metadata: { score, correct, total } }` (any quiz, incl. knowledge checks).
2. **Exam-pass** — same `quiz/run` route: when `quizName` is an exam quiz (parses to tier `'exam'`, i.e. `<series>:exam`) **and** `attempts.score >= 72` → append `{ eventType: 'exam', metadata: { score } }`. Score is server-derived from graded `quiz_attempt` rows (F1 — never reads client score).
3. **Certificate-eligibility** — `/learn/[series]/certificate/page.tsx`: when `eligibility.eligible` is true → append `{ eventType: 'certificate', metadata: { certifiedAt } }`, idempotent (one row per user/course/event_type).

### Streak fix (live, `now`-relative)

`deriveProgress` currently returns the run ending at last activity (a user idle 5 days still sees their old streak) because `CompletionInput.now` is never used. Fix: compute the current streak relative to the injected `now`:
- no events → `streakDays = 0`;
- last completion day is **not** today or yesterday → `streakDays = 0`;
- otherwise count consecutive days backwards from the last day.
`longestStreakDays` stays the all-time max. **Add a test** where the last event is `< now` (e.g. 5 days ago) asserting `streakDays === 0`.

### Rank derivation (pure)

Constellation-themed bands, ascending: `starseed → wayfarer → explorer → polestar → celestial`. A learner's rank = the highest band whose thresholds are met (lessons **or** courses, OR-combined). Pure helper `deriveRank(lessonsCompleted, coursesCompleted, ladder)` → `Rank { id, name, description, index, nextProgressPct }`. No DB table.

| Band | lessonsRequired | coursesRequired |
|---|---|---|
| starseed | 0 | 0 |
| wayfarer | 5 | 0 |
| explorer | 20 | 2 |
| polestar | 50 | 4 |
| celestial | 100 | 8 |

## Route / component mapping (B-18)

| Priority | Route | Component (existing → change) | New component | Shows |
|---|---|---|---|---|
| P1 | `/learn/[series]/[slug]` | `LessonCompleteProgress`, `MarkComplete` → mount celebration on complete | `ConstellationCelebration` + `StreakCounter` | Star "ignition" pop + brief constellation pulse + live streak at the habit-loop beat |
| P1 | `/learn/[series]` | `SeriesSyllabus` → add constellation + Chronicle beside it | `SeriesConstellation` | Full course constellation (lesson = star, lit as completed) + recent completions |
| P1 | `/learn` | `LearnHub`, `PathCard` → preview in card header | `ConstellationPreview` (compact) | Per-course constellation preview replaces/augments the flat gradient — keep light |
| P2 | `/profile` | `CertificateSection` → add sky section | `FullSkySection`, `ChronicleFeed`, `LockedSkyTeaser` (guest) | Full sky: aggregate constellations, streak, rank ladder, Chronicle feed |
| P2 | `/learn/[series]/certificate` | certificate page → reveal behind celebration | `CertificateCelebration` | Constellation completes + certificate reveal (enabled by B-07 interim + D2) |
| P3 | `/blog` + post | `BlogReadProgress` | (deferred — optional mini-constellation) | N of M posts read |
| Later | track pages | — | (deferred, gated B-27/B-26) | 3-star track constellation, Level 1→2→3 |

**Chronicle placement:** the profile, fed by the same completion events. No new IA surface.

## Data flow

- **P1 nice-to-have / pop stats:** `GET /api/progress/achievement` (new) → server reads `completion_events` → `deriveProgress` → `AchievementStats` (live streak + rank). Consumed by `ConstellationCelebration`/`StreakCounter` (lesson complete) and `ConstellationPreview` (hub) via a small `useAchievement` hook.
- **P1 outline / hub constellation state:** derived client-side from `useProgressSummary.completedLessons` + each series' lesson slugs (bare slugs already returned) → `buildConstellation(series, lessonSlugs, completedLessons)` pure helper (in `src/lib/sky.ts`). No new endpoint needed.
- **P2 profile full sky:** server loader `getProfileSky(userId)` (`src/lib/sky.ts`) reads `completion_events` (owner-scoped via RLS) → `deriveProgress` + `buildConstellations` + recent-events `ChronicleEntry[]` → `ProfileSky` passed to `FullSkySection`. Server-rendered — guest branch renders `LockedSkyTeaser`.
- **Certificate celebration:** certificate page already derives eligibility server-side; now also appends the `certificate` event + renders `CertificateCelebration` before the printable `Certificate`.

## Contracts

`src/shared/contracts-constellations.ts` (new, additive, tsc-verified): `CompletionEventType`, `CompletionMetadata`, `CompletionEventRow` (widened), `AppendCompletionInput`, `RankId/RankBand/Rank/LadderProgress`, `ConstellationStar/ConstellationState/AchievementStats/ChronicleEntry/ProfileSky`, and the P1/P2 component prop interfaces. Steel additionally **wides** `CompletionEventRow.event_type` + `DerivedProgress` (add `rank`/`ladder`) in `src/shared/contracts-course-catalog.ts` to match.

## ADR

- **ADR-213 — Event types widened, not new tables.** Add `quiz/exam/certificate` + `metadata` to the existing append-only `completion_events` rather than per-kind tables: one timeline feeds every surface (course constellation, Chronicle, streaks, rank) and RLS/read paths are unchanged. Consequence: the `event_type` CHECK must be drop/re-added (Postgres limitation); existing rows unaffected.
- **ADR-214 — Rank derived in code, not stored.** Bands + `deriveRank` live in `contracts-constellations.ts` / `completion.ts` — pure and unit-testable, zero schema. Enables the ladder to ship without a migration and to be tuned by editing thresholds. Consequence: rank isn't queryable in SQL; for analytics, the `certificate`/`exam` events carry the durable records.
- **ADR-215 — Achievement stats via a server route, constellation state client-derived.** Streak/rank need the full `completion_events` set → a single `GET /api/progress/achievement` (server) keeps numbers trustworthy. Per-course constellation geometry needs only the completed-lesson set the summary already returns → derived client-side, no extra fetch.
- **ADR-216 — Certificate-eligibility recorded as an idempotent event.** The certificate page appends one `certificate` event on eligibility so the Chronicle/sky have a durable "earned" record without a certificates table. Best-effort (append never fails the render), idempotent via the event key.

## Risks

- **Streak correctness:** the live-streak fix changes `streakDays` semantics at the lesson-complete beat; the P1 counter must use the *post-write* value (fetch `/api/progress/achievement` after the `lesson` event resolves), never a stale render. Test `last-event < now → 0` guards regression.
- **Certificate event double-log:** the page may re-render; `appendCompletionEvent`'s (user, course, event_type, lesson_slug) idempotency guard must cover the `certificate` event (lesson_slug null → still deduped by user+course+event_type). The inserted `metadata` must not defeat the guard.
- **Write-site audit / no-forge:** all three new writes derive their payload server-side; the metadata envelope must never accept client-supplied score/tier (F1 discipline).
- **RLS regression:** verify the widened rows remain select-own/insert-own/update-delete-none after the constraint re-add (no policy touching `event_type`).
- **Hub perf:** `ConstellationPreview` must stay the compact variant — a 12-lesson star grid is fine, but don't ship full Chronicle geometry on `/learn`. Reuse a single dev server (`ensure-next-dev.sh`) across sub-tasks.

## Acceptance criteria (for QA)

1. `completion_events.event_type` accepts `quiz`/`exam`/`certificate` after migration 010; existing rows unchanged.
2. A recorded quiz run appends a `quiz` event with `metadata.score`; an exam ≥72% appends an `exam` event; the certificate page appends exactly one `certificate` event when eligible (re-renders → still one).
3. `deriveProgress`'s `streakDays` is 0 when the last event is not today/yesterday; a live streak (event yesterday or today) is still counted; new test `last-event < now → 0` passes.
4. `deriveProgress` returns `rank` + `ladder`; rank == highest reached band; `nextProgressPct` math correct.
5. P1: lesson-complete moment shows a star-ignition pop + live streak; series outline shows the full constellation (lit/completed) + recent Chronicle; hub card shows a compact preview.
6. P2: `/profile` shows the full sky (constellations, streak, rank ladder, Chronicle feed) for a signed-in user; a guest sees the locked-sky teaser.
7. P2: certificate page reveals the constellation-complete celebration before the printable certificate.
8. RLS: a raw client cannot read/insert others' events, update/delete any event — for all five event types.
9. `npm run build` + `npm test` pass; contract types (contracts-constellations.ts) still tsc-clean.