# Implementation Plan — Interactive Quiz Tiers (Lesson / Check / Exam / Certificate)

> **Task:** t_cf2e9661 (Arch) · **Tenant:** adroit-blog · **Repo:** `adroit-blog`
> **Author:** brainiac (web architect) · **Date:** 2026-08-10
> **Governing specs:** `docs/course-progression-pattern.md` (canonical), `docs/requirements-quiz-tiers.md` (BA), plan `/Users/kelex/.hermes/plans/2026-08-10_182705-omni-interactive-quiz-tiers.md`, design copy `design/copy-deck-quiz-tiers.md` (exact strings — steel MUST use verbatim).
> **Pipeline:** this doc + the `decomposition-plan:` comment on t_cf2e9661 are the contract source for the pre-created steel children: t_22855141 (content-gen), t_9756b64d (implement), t_959ca6bf (certificate), then lara (a11y, t_5ed4bb0f) → val-el → zod → alpha.

---

## 1. Goals

Replace the flat prose practice-question sections on OmniStudio cert lessons with a
three-tier gated quiz system, plus a timed cert-prep exam and a certificate of completion:

| Tier | Route | Size | quizName | Pass rule |
|---|---|---|---|---|
| Lesson quiz | on lesson page (Practice Questions section) | 3 q | `omni-studio-cert:lesson:<slug>` | none (practice, immediate feedback) |
| Knowledge check | `/learn/<series>/check/<n>` | 15 q | `omni-studio-cert:check:<n>` | best score ≥ 80% (80 flat passes) |
| Cert prep exam | `/learn/<series>/exam` | 60 q | `omni-studio-cert:exam` | ≥ 72%, timed 105 min, auto-submit at 0, **locked until all checks ≥ 80%** |
| Certificate | `/learn/<series>/certificate` | printable | n/a | all 46 lessons complete + exam best ≥ 72% |

All quiz content is gated behind login: guests see a sign-up CTA placeholder and
**zero question text in the HTML**.

---

## 2. Current-state audit (what exists, what changes)

**Stays as-is (reused):**
- `QuizWidget.tsx` — interactive MCQ component (segment progress, radiogroup roving, "Why" panel, score ring, retake). Props `{ quizName, questions }`. Reused for lesson quizzes + knowledge checks.
- `useQuizProgress` — localStorage-first (ADR-004) + Supabase sync for authed. Hydration gate (QA F-1) and session-scoped run completion (QA F-2) are already built in.
- `POST /api/progress/quiz` — per-question server-side grading (origin check, rate limit, validateSlug, recompute correctness F3). **Needs a quizName-resolver change** (see §4.2).
- `POST/GET /api/progress/quiz/run` — run stats (bestScore, attempts) per quizName.
- `quiz_attempt` / `quiz_run` / `lesson_completion` tables — **no schema changes**.
- `getSupabaseServerClient()` session helper, `useAuth` hook, `/api/auth/session`.
- `getQuizForSeries(series)` — reads `content/<series>/questions.json`. Stays as **generic plumbing only**; omni-studio-cert retires its series-root file (Decision 8).

**Changes / new:**
1. **New lib functions** in `src/lib/quiz.ts` — tier lookups (§4.1).
2. **quizName resolver + validation** — colon-separated tier names break the existing `validateSlug` regex and the `getQuizForSeries(quizName)` call in the grading route (§4.2). **Critical.**
3. **Batch exam grading** — new `POST /api/progress/quiz/batch` (§4.3).
4. **Gating** — server-side session checks on lesson / check / exam / certificate pages; guest → `GuestCTA` placeholder; questions JSON never loaded for guests (§5).
5. **`ExamWidget.tsx`** (new) — timed exam mode, no per-question feedback, auto-submit, results + review (§6).
6. **Exam unlock** — server-side gate from `quiz_run` best scores per check (§6.2).
7. **Certificate page** — server-validated printable view (§7).
8. **Ordering/filter** — lesson-number ordering (lib + build script sync), SortToggle retarget, "Hide completed" filter (§8).
9. **Progress rollup** — "Lessons X/46 · Checks X/9 · Exam best Y%" + readiness bar; `QuizStats` scope prop (§9).
10. **Legacy removal** — old `/learn/[series]/quiz` route 404, "Take the quiz" → "Take the exam", prose scrub of published lessons (§10).

---

## 3. Data model — one generator, three JSON tiers

Generator (t_22855141, `scripts/generate-omni-quizzes.py`) emits, from
`~/.hermes/scripts/omni-studio-curriculum.py` (46 requirements × 3 q + 13 on entry 46 ≈ 148):

```
content/learn/omni-studio-cert/
  questions/<slug>.json        # 46 files, 3 q each (per-lesson)
  checks/check-<1..9>.json     # 9 files, 15 q each (pooled from lessons 5n−4..5n)
  exam.json                    # 60 q, domain-weighted ≈ 11/9/12/9/10/9
```

JSON shape (identical to existing series file):
```json
{
  "quizName": "omni-studio-cert:lesson:day-01-f1",
  "title": "Lesson 1 — ...",
  "description": "...",
  "questions": [
    { "question": "...", "options": ["A","B","C","D"], "correct_answer_index": 0, "explanation": "..." }
  ]
}
```

**Quiz-name scheme (non-negotiable, from the course-progression pattern):**
`<series>:lesson:<slug>` · `<series>:check:<n>` · `<series>:exam`.

**Retired for omni-studio-cert:** `content/omni-studio-cert/questions.json` (legacy series quiz, Decision 8). The file may be deleted; `getQuizForSeries` stays for generic plumbing.

---

## 4. Data-access + API layer

### 4.1 `src/lib/quiz.ts` — new tier lookups

Same fs-read pattern + slug validation as `getQuizForSeries`. Add:

```ts
getQuizForLesson(series: string, slug: string): QuizData | null
  // reads content/learn/<series>/questions/<slug>.json

getKnowledgeChecks(series: string): KnowledgeCheckMeta[] | []
  // scans content/learn/<series>/checks/ for check-<n>.json, returns [{n, lessons:[a,b]}]
  // omni-studio-cert → n=1..9, lessons [1,5]..[41,45]

getKnowledgeCheck(series: string, n: number): QuizData | null
  // reads content/learn/<series>/checks/check-<n>.json

getCertExam(series: string): QuizData | null
  // reads content/learn/<series>/exam.json
```

All functions reject invalid series/slug/n via the existing `QUIZ_SERIES_RE` guard
(no dots/slashes → no path traversal). n validated to the actual check range (1..9).

### 4.2 quizName resolver + validation (CRITICAL)

**Problem:** tier names contain colons (`omni-studio-cert:lesson:day-01-f1`), but:
1. `validateSlug` (`/^[a-zA-Z0-9_-]+$/`) rejects colons → every tier attempt would 400.
2. `POST /api/progress/quiz` calls `getQuizForSeries(quizName)` → looks for
   `content/omni-studio-cert:lesson:day-01-f1/questions.json` → null → grading silently skipped.

**Fix (in this build):**
- Add `validateQuizName(value, label)` in `src/lib/api-security.ts`:
  regex `/^[a-zA-Z0-9:_-]+$/` (colon allowed, still no dots/slashes/space), max 200.
  Use it for `quizName` in `/api/progress/quiz`, `/api/progress/quiz/run`, and the new batch route.
- Add `resolveQuizByName(quizName): QuizData | null` in `src/lib/quiz.ts`:
  parses `<series>:<tier>:<id>` → dispatches to `getQuizForLesson` / `getKnowledgeCheck` /
  `getCertExam`. Bare series names (legacy `omni-studio-cert`) fall back to `getQuizForSeries`.
- `POST /api/progress/quiz` switches from `getQuizForSeries(quizName)` → `resolveQuizByName(quizName)`.

### 4.3 Batch exam grading — `POST /api/progress/quiz/batch` (NEW)

Decision: **new route**, not an extension of the single-attempt route. One request for the
whole 60-question exam (never 60 sequential POSTs).

```
POST /api/progress/quiz/batch
Body: {
  quizName: "omni-studio-cert:exam",
  elapsedSeconds: number,        // client-reported, server-validated (§6.3)
  answers: [{ questionIndex, userAnswerIndex }, ...]   // 1..60 items
}
200: {
  score: 78,                     // 0-100
  correct: 47, total: 60,
  passed: true,                  // score >= 72
  results: [{ questionIndex, isCorrect, correctAnswerIndex }]  // for review screen
}
```

Server behavior:
1. `checkOrigin` + `checkRateLimit` (existing helpers — a batch submit is 1 request; 30/min is ample).
2. `validateQuizName`; `resolveQuizByName` must return a quiz with 60 questions (reject other tiers).
3. Validate every `questionIndex` (0..59) and `userAnswerIndex` (0..options-1) via `validateIndex`.
4. **Recompute correctness server-side** from the canonical exam.json (F3 — client `isCorrect` never trusted).
5. Upsert all 60 `quiz_attempt` rows in one batch (`onConflict: "user_id,quiz_name,question_index"`).
6. Insert one `quiz_run` row `{ quiz_name, correct, total, score, completed_at }`.
7. Return score + per-question results so the client renders the review without ever shipping
   correct answers in the initial HTML.

**Double-submit guard:** client disables submit while in flight + ignores duplicate responses.
Server tolerates duplicate `quiz_run` rows (best-score = MAX semantics; attemptCount may over-count
on a rare double-fire — acceptable, documented in risks). No schema change.

### 4.4 Tier progress endpoint — `GET /api/progress/quiz/tiers` (NEW)

The series page rollup (§9) and check/exam cards need per-check best scores without 10
round-trips. Add:

```
GET /api/progress/quiz/tiers?series=omni-studio-cert
200 (authed): {
  lessons: { completed: 12, total: 46 },
  checks:  [{ n:1, bestScore:85, attempts:2, passed:true }, ...],   // 9 entries, MAX(score) per quiz_name
  exam:    { bestScore:78, attempts:1, passed:true },
  unlocked: true                                                   // all checks passed >= 80
}
200 (guest): all zeros / empty — client renders nothing or CTA-safe zeros (never question text)
```

Server: `validateSlug(series)`; for authed user query `quiz_run` rows for the 9 check
quizNames + exam quizName, group MAX(score); lesson count from `lesson_completion`.

---

## 5. Gating pattern (server-side, non-negotiable)

**Rule: guests never receive question content — not in HTML, not in the initial payload.**

| Page | Guest | Authed |
|---|---|---|
| Lesson `/learn/[series]/[slug]` | `GuestCTA tier="lesson"` | `<LessonQuiz questions={getQuizForLesson(...)} />` |
| Check `/learn/[series]/check/[n]` | `GuestCTA tier="check"` | `QuizWidget` (15 q) |
| Exam `/learn/[series]/exam` | `GuestCTA tier="exam"` | locked panel or `ExamWidget` (§6) |
| Certificate `/learn/[series]/certificate` | `GuestCTA tier="certificate"` | eligible or not-eligible state (§7) |

- **Server component pattern:** `const supabase = await getSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();` → branch.
- Lesson pages become **dynamic-ish** (session read in a previously static page). Accepted trade-off (plan risk item): prefer server-side gate so guest HTML never contains questions. Do **not** ship questions to the client and gate client-side.
- Question JSON is loaded **only in the authed branch** of the server component.
- Copy: exact strings from `design/copy-deck-quiz-tiers.md` §5 (headline `Test what you learned and track your progress by creating an account and logging in!`, per-tier kicker/benefit/body, `Create an account` / `Log in` → `/login?next=<path>`).
- Component: new `src/components/Progress/GuestCTA.tsx` (client, uses `useSearchParams` for `next`).

---

## 6. Exam design

### 6.1 `ExamWidget.tsx` (NEW, `src/components/Progress/ExamWidget.tsx`)

Client component, props `{ quizName, questions }`. Differs from QuizWidget:
- **No per-question feedback during the run** (no correct/wrong styling, no "Why" panel, no explanation).
- Flag-for-review, question navigator, `{n} answered` counter (per copy deck §4).
- 60 questions, 105:00 countdown, **auto-submit at zero**.
- On submit → `POST /api/progress/quiz/batch` → results screen: score ring, pass/fail verdict
  (≥72%), answer review with flagged items, `Retake exam` + `Back to series`.

### 6.2 Unlock gate (server-side)

Exam page server component:
- Guest → CTA.
- Authed → query `quiz_run` for `omni-studio-cert:check:<1..9>` best scores.
  - Any check missing or best < 80 → render **locked panel** (`ExamLocked`): exact copy
    `Unlock: complete all 9 knowledge checks with 80%+` + per-check progress list
    (Passed · {best}% / {best}% · 80% required / 80% required). Rows link to each check page.
  - All 9 ≥ 80 → render `ExamWidget`.

### 6.3 Timer trust model

Decision: **client-side countdown + server-side elapsed bound** (no new table, no server
session token — proportionate for a prep tool; a real proctored exam is out of scope).

- Client stores `startedAt = Date.now()` when the exam starts; countdown = deadline − now
  (drift-proof under tab throttling); `prefers-reduced-motion` respected (warning pulse is a CSS
  transition lara will gate).
- On submit (manual or auto), send `elapsedSeconds = floor((Date.now() - startedAt)/1000)`.
- Server rejects `elapsedSeconds` outside `[0, 105*60 + 60]` (60s grace) → 400. This bounds
  clock tampering / paused timers. Note in val-el's security review scope.
- Auto-submit at 00:00 is client-side; if the tab was backgrounded the deadline still fires on
  return via the interval + a `visibilitychange` check.

---

## 7. Certificate

- **Route:** `/learn/[series]/certificate` (server component, dynamic — always fresh).
- **Gate:** guest → CTA. Authed → derive eligibility from rows (NO new table):
  - `lesson_completion` rows for the series: count distinct lesson_slug vs `totalLessons` (46).
  - `quiz_run` best score for `omni-studio-cert:exam` ≥ 72.
- **Eligible:** render printable `<Certificate>` per `design/mockup-certificate.html` + copy
  deck §7 (recipient name from `user.user_metadata` display name or email, series name, date,
  exam score, seal SVG — no image generation). Print CSS: `.no-print` on nav/footer,
  `@page { margin: 0 }`, `print-color-adjust: exact`.
- **Not eligible:** show missing-progress checklist (lessons X/46, exam ≥72% Y/Z, checks passed)
  per copy deck §7.

---

## 8. Ordering / filter

**Contract change (ADR-002 superseded for lesson listings):** lessons ordered by **lesson
number ascending**, not date.

1. `src/lib/learn.ts` — `getLessonsForSeries`: newestFirst → sort by `lesson` asc (stable,
   missing lesson field sorts last). Update the ADR-002 comment.
2. `scripts/build-learn.js` — `sortLessonsNewestFirst` → `sortLessonsByLessonNumber` (asc) for
   the per-series `lessons` array. **Keep both in sync** (lib defensive sort + generation sort).
   Series-level (hub PathCards) ordering stays activity/newest (plan default).
3. **SortToggle retarget** — the series page sort control switches from date newest/oldest to
   lesson-number asc/desc. New prop or new component (`LessonSortToggle`): reads/writes
   `?sort=asc|desc` (default asc), aria-pressed states (lara will audit).
4. **"Hide completed" filter** — client-side toggle on the series page wired to
   `useLessonProgress`/`lesson_completion` (localStorage + Supabase, hydration-gated per QA F-1
   pattern). New client wrapper `SeriesSyllabus` (owns sort + filter state, maps
   `LessonCard` rows) receiving the server-rendered lesson list as props. Guests see the same
   list with no filter effect (no progress) or the filter hidden — decision: show filter, it
   simply has nothing to hide for guests.
5. `LessonCard` `isNewest` badge — no longer meaningful under lesson ordering; drop usage on the
   series page (keep prop for backward compat or remove).

---

## 9. Progress rollup

Replace the old series-quiz `QuizStats` on the series header with tier-aware rollup for courses
with tiers (omni-studio-cert):

- New client component `CertReadiness` (or extend `QuizStats` with `scope`):
  - `Lessons {c}/{total}` (from `lesson_completion` + totalLessons)
  - `Checks {p}/9` (passed ≥ 80)
  - `Exam best {b}%`
  - Weighted readiness bar: **lessons 40% / checks 30% / exam best 30%** (BA open question 2 —
    arch confirms this weighting).
- Data: `GET /api/progress/quiz/tiers` (§4.4), hydration-gated (server renders placeholder,
  client fills after mount).
- `QuizStats` gains optional `scope: "lesson" | "check" | "exam" | "all"` prop so it can
  aggregate a single tier; default behavior (old series quiz) retained for non-tier series.

---

## 10. Legacy removal

1. Delete `src/app/learn/[series]/quiz/page.tsx` → `/learn/omni-studio-cert/quiz` returns 404.
2. Series page: remove "Take the quiz" button; replace with exam card — locked state
   (`Locked — checks passed X/9 · 80% required` + `Complete checks to unlock`) or unlocked
   (`Unlocked — all 9 checks passed` + `Take the exam →`), per copy deck §6.
3. Retire `content/omni-studio-cert/questions.json` for omni-studio-cert.
4. **Prose scrub** (implement task): remove `## Practice Questions` from all 8 published lesson
   MDX files — both formats (`**Q:**`+bullets in lessons 1–5, `**Q1.**`+inline letters in 6–8).
   Question content lives in the sidecar JSON now. Verify `git diff` shows question-section
   removals only.

---

## 11. Edge cases

| Case | Handling |
|---|---|
| No questions file for a lesson | `getQuizForLesson` → null → authed lesson renders **nothing** (no placeholder card) per copy deck §1; guest still sees CTA |
| Check/exam file missing (generator not run) | `getKnowledgeCheck`/`getCertExam` → null → page 404s or renders a "not available yet" state (arch choice: 404 is fine — content-gen ships all 9 + exam) |
| Hydration mismatch | reuse `useQuizProgress`/`useLessonProgress` hydration gates (QA F-1); new components follow the same pattern |
| Timer tab-away / throttling | deadline-based countdown, not decrement; server elapsed bound; auto-submit on return |
| Retake scoring | best score = MAX over runs (quiz_run); unlimited retakes; localStorage + Supabase both preserved |
| Day-46 lesson has 13 questions | lesson quiz takes the canonical 3; the extra 10 feed the exam pool only (generator contract) |
| 80% boundary | **80.0 flat passes** — server compares `bestScore >= 80`, copy deck shows `Passed — 80 flat counts` |
| Legacy quiz route | deleted → 404 (verification: curl) |
| `validateSlug` colon rejection | fixed via `validateQuizName` (§4.2) — verify tier names accepted on all three routes |
| build-learn.js ordering | per-series lessons sorted by lesson number; lib defensive sort matches (both changed together) |

---

## 12. ADRs

| ID | Title | Context | Decision | Consequences |
|---|---|---|---|---|
| ADR-101 | Tier quiz-name scheme | Course progression needs namespaced, per-tier quiz identity in a free-form `quiz_name` column | `series:lesson:<slug>` / `series:check:<n>` / `series:exam` | Requires `validateQuizName` + `resolveQuizByName`; no schema change |
| ADR-102 | Batch exam grading route | 60 sequential POSTs is bad; existing route is per-question | New `POST /api/progress/quiz/batch`; existing route unchanged for lesson/check | One request per exam; server recomputes all correctness; double-fire tolerance documented |
| ADR-103 | Exam timer trust model | No new table allowed; prep tool not a proctored exam | Client countdown + server-side elapsed bound [0, 105:60 + 60s grace] | Bounds tampering; not foolproof — flagged for val-el |
| ADR-104 | Server-side gating | Guest HTML must never contain questions | Session check in server components; questions loaded only when authed | Lesson pages become dynamic-ish (minor perf cost) |
| ADR-105 | Lesson-number ordering | Course is sequential; date order is wrong for learn | Lesson listings sort by lesson number asc; SortToggle + build-learn.js synced | ADR-002 superseded for learn lesson listings; hub series ordering unchanged |
| ADR-106 | Certificate derived on demand | No schema change; badges/profile are post-v1 | Derive eligibility from `lesson_completion` + `quiz_run` at render time | Revalidated at print time; no certificates table (add later if badges need it) |
| ADR-107 | Readiness weighting | BA open question | lessons 40% / checks 30% / exam best 30% | Display-only metric; no schema impact |

---

## 13. Component map

```
src/app/learn/[series]/page.tsx            (server; lesson-number order, syllabus, tiers cards)
  └─ SeriesSyllabus (client)               ← owns sort + hide-completed
  └─ CertReadiness (client)                ← lessons/checks/exam + readiness bar (GET /tiers)
  └─ CheckCardList (client or server)      ← 9 check rows w/ pass state (GET /tiers)
  └─ ExamCard (client)                     ← locked/unlocked + "Take the exam"

src/app/learn/[series]/[slug]/page.tsx     (server; session gate)
  └─ GuestCTA | LessonQuiz (client)        ← LessonQuiz wraps QuizWidget w/ lesson copy

src/app/learn/[series]/check/[n]/page.tsx  (server; SSG params 1..9, session gate)
  └─ GuestCTA | QuizWidget (15 q)

src/app/learn/[series]/exam/page.tsx       (server; unlock gate)
  └─ GuestCTA | ExamLocked | ExamWidget (client)

src/app/learn/[series]/certificate/page.tsx (server; eligibility)
  └─ GuestCTA | Certificate (client print) | NotEligible

src/components/Progress/
  GuestCTA.tsx  ExamWidget.tsx  ExamLocked.tsx  CertReadiness.tsx  CheckCardList.tsx
  Certificate.tsx  (QuizWidget/QuizStats extended, not rewritten)
```

---

## 14. Contracts (`src/shared/contracts.ts`)

Written as part of this arch task and referenced by all three steel children — see
`src/shared/contracts.ts` for the compiled TypeScript. Key types:

- `QuizTier`, `ParsedQuizName`, `QuizQuestion`, `QuizData`
- `KnowledgeCheckMeta`, `CheckProgress`, `ExamUnlockState`
- `ExamSubmitRequest`, `ExamSubmitResult`
- `TierProgressResponse`, `CertificateEligibility`
- `ReadinessRollup`

The full definitions ship in the `decomposition-plan:` comment on t_cf2e9661 (JSON string the
pipeline-progress cron writes to `src/shared/contracts.ts` and validates with `tsc --noEmit`).

---

## 15. Implementation steps (maps to the pre-created children)

| Step | Task | Assignee | Produces |
|---|---|---|---|
| 1 | **Content gen: emit quiz JSON tiers** — t_22855141 | steel | `scripts/generate-omni-quizzes.py` + 46 lesson files + 9 checks + exam.json; verification: counts + JSON parses + idempotent |
| 2 | **Implement: lesson quiz + checks + exam + ordering/filter** — t_9756b64d | steel | lib lookups + resolver (§4), batch route (§4.3), tiers endpoint (§4.4), gating (§5), ExamWidget + unlock (§6), ordering/filter (§8), rollup (§9), legacy removal + prose scrub (§10) |
| 3 | **Implement: certificate** — t_959ca6bf | steel | certificate page + printable component (§7); build/lint pass |
| 4 | **A11y/SEO audit** — t_5ed4bb0f | lara | timer reduced-motion, radiogroup/focus, guest CTA semantics, no question leakage, ordering/filter a11y |
| 5 | Security — val-el · QA — zod · Deploy — alpha (chain after lara) | — | server-side grading, slug/elapsed validation, cert integrity; acceptance criteria from BA; live deploy |

**Dependency note:** implement (step 2) depends on content-gen (step 1) for its verification
(the JSON files), but can build against the file-shape contract in parallel; certificate
(step 3) depends only on the contract + lesson/exam data semantics, not on step 2 code.

---

## 16. Acceptance criteria (testable)

1. `npm run build` + `npm run lint` pass on the repo.
2. Generator output: 46 lesson files (3 q each), 9 check files (15 q each), exam.json (60 q,
   domain weights within ±1 of blueprint).
3. Guest (incognito): lesson/check/exam/certificate pages show CTA; **no question text in HTML
   source**; legacy `/learn/omni-studio-cert/quiz` → 404.
4. Authed lesson: interactive 3-question quiz; answers record `quiz_attempt` rows (verify via
   REST with anon key).
5. Checks: best ≥ 80 passes (80.0 flat passes); card shows `Passed · {best}%`.
6. Exam: locked until all 9 checks ≥ 80 (locked panel shows per-check progress); unlocked →
   60 q, 105:00 countdown, auto-submit at 0, no per-question feedback, ≥ 72% passes, batch
   records 60 attempt rows + 1 run row, retakes update best.
7. Series page: lessons in lesson-number order; sort asc/desc; hide-completed works and
   survives hydration; exam card locked/unlocked; "Take the exam" replaces "Take the quiz".
8. Certificate: shows only when 46 lessons + exam ≥ 72 (server-validated); prints cleanly;
   not-eligible shows checklist.
9. `git diff` on lesson MDX = question-section removals only.

---

## 17. Risks

- **validateSlug colon rejection** — must land in step 2 before any tier attempt works; the
  fastest way to see "everything 400s".
- **Double-submit on exam** — batch route tolerates via MAX-semantics; attemptCount may over-count.
- **Timer trust is bounded, not bulletproof** — val-el reviews; a proctored model (server token /
  table) is post-v1 if Chris wants it.
- **Lesson pages become dynamic** — minor SSG loss on lesson routes; accepted.
- **Ordering contract drift** — lib + build-learn.js + SortToggle + LessonCard badge must change
  together; QA checks all four.
- **Prose scrub risk** — removing `## Practice Questions` must not touch deep-dive content;
  verify `verify-article.py`-style checks ignore learn dirs (plan says they do — confirm).
- **Generator/implement ordering** — implement can verify without JSON by stubbing file reads;
  integration check runs after content-gen lands.
