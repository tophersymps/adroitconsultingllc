# Ready-to-file cards — Learn lesson IA + exam naming (t_47db5c5e)

Two lanes, one release. Every card is scoped to **30–45 minutes**, does **one** thing, and states what
exists when it is done. Dependencies are the `parents=[...]` lists — file the cards in this order so the
ids are available.

Lane B (exam naming) is independent of lane A and can start immediately.

> Filing note: the orchestrator files these (Lois/Chris own the board). This document is the card body
> source; copy each body verbatim so the shared contracts survive the handoff.

---

## Lane K — Kara (design). File first: A5 and A8 depend on these.

### K1 — Design: milestone check node in the syllabus timeline
- **assignee:** kara · **parents:** none · **est:** 45 min
- **Done means:** a design spec (desktop + mobile) for one check node, plus a mockup HTML that can be
  read at 360 px, committed under `design/`.
- **Body:**
  - Design `Knowledge Check N · Lessons A–B` as a **node in the lesson list**, not a card in its own
    section. It must read as a milestone: distinct marker (`K1`), milestone emphasis, and a state badge.
  - States: `Passed · 87%` and `Available` only. **There is no `Locked` state** — D-1 is decided: no
    lesson gating (architecture.md §4). Do not design a locked badge, a locked row treatment or locked
    copy; a check is a milestone, never a door.
  - Constraints: row height ≥ 44 px at every width; badge must not be colour-only (text + icon); no
    fixed `min-width` (the syllabus must not gain horizontal scroll at 360 px); long range labels must
    not truncate the state badge.
  - Show it **between** lesson 5 and lesson 6 at: 360×800, 390×844 (portrait), 768×1024 (portrait +
    landscape), 1280×800.
  - Deliver `design/check-timeline-node.md` + `design/mockup-check-node.html`.
  - Do not change copy strings — the label comes from `examLabels(kind).unlockNote()` (Lois owns wording).

### K2 — Design: completion control in the sticky audio bar
- **assignee:** kara · **parents:** none · **est:** 45 min
- **Done means:** a spec + mockup showing the control in both states at 360/390/844×390, with the
  two-row mobile layout resolved.
- **Body:**
  - The lesson audio bar is a sticky card (header row: "Listen to this lesson", Follow-along, Speed;
    then the native `<audio>`). Add a `Mark complete` control to that header row.
  - Incomplete state: button, "Mark complete", ≥ 44×44 px, must not shrink the audio element.
  - Complete state: static "Completed" chip (no toggle) — un-marking stays in the hero control.
  - Resolve the crowding case: at 360 px the header row wraps; decide whether the Follow-along label
    collapses to an icon, and show the control's position relative to Speed and the audio element.
  - Landscape 844×390 (short viewport): the bar must not eat the reading area — show the compact form.
  - Reduced motion: no animated state change.
  - Deliver `design/sticky-complete-control.md` + `design/mockup-sticky-complete.html`.

### K3 — Design: lesson sources at the very bottom (incl. anchor offsets)
- **assignee:** kara · **parents:** none · **est:** 30 min
- **Done means:** a spec note + one mockup showing body → practice questions → check panel → **Sources**
  at 360 px and 1280 px.
- **Body:**
  - The Sources list is now the last block on a lesson page (after the knowledge-check affordance).
  - Specify the visual separation from the check panel (it must not read as part of the exercise).
  - Long source URLs must wrap at 320–360 px (`overflow-wrap`), footnote back-reference arrows must stay
    tappable (≥ 44 px target or 24 px + spacing).
  - Specify `scroll-margin-top` for footnote targets and headings so an anchor jump (source → ↩) is not
    hidden under the sticky bar. Give the number in one CSS custom property.
  - Deliver `design/lesson-sources-bottom.md` (mockup optional if the diff is a note only).

---

## Lane A — Steel (implementation). Items 1, 2, 4.

### A1 — MDX body/sources split (Item 1 foundation)
- **assignee:** steel · **parents:** none · **est:** 45 min
- **Done means:** `src/lib/lesson-sources.ts`, `src/components/MDX/footnote-plugins.ts`,
  `src/components/MDX/MDXSources.tsx`, the `sources` prop on `MDXArticle`, and their tests exist and
  pass; blog output is unchanged.
- **Body:** implement exactly `api-contracts.md` §A.1–A.4.
  - Two filtered renders of the same document (probe results in `architecture.md` §3.1): body render
    drops `section[data-footnotes]`, sources render keeps only it.
  - `MDXArticle` default is `"inline"` — **no** existing caller changes; blog/preview/paywall output must
    be byte-identical.
  - `MDXSources` returns `null` when there is no footnotes section (no empty heading).
  - Tests: body has refs and zero footnote sections; sources has exactly one `li#user-content-fn-1`;
    every body `fnref` id has a matching backref href; a document with no definitions renders nothing.
- **Evidence:** `npx vitest run src/components/MDX src/lib/lesson-sources.test.ts` output in the handoff.

### A2 — Lesson page composition: citations last
- **assignee:** steel · **parents:** [A1] · **est:** 30 min
- **Done means:** `/atlas/[series]/[slug]` renders body → practice questions → **Sources** → nav, and the
  Sources block is the last content block.
- **Body:** wire `sources="split"` + `<MDXSources>` into the lesson page inside `article.article-body`;
  gate `MDXSources` on `hasFootnoteDefinitions`. Add the `scroll-margin-top` CSS from K3. Do **not** touch
  the preview routes or `PreviewFirstLesson` (they stay `inline`). Sources block must not render twice.
- **Evidence:** page test asserting DOM order + single `section[data-footnotes]`; screenshot 360 and 1280.

### A3 — Lesson↔check mapping module
- **assignee:** steel · **parents:** none · **est:** 45 min
- **Done means:** `src/lib/lesson-checks.ts` + `lesson-checks.test.ts` pass with the full edge-case set.
- **Body:** implement `api-contracts.md` §B.1. Position from `check.lessons[1]` (the range end
  `getKnowledgeChecks` resolved from the check title), never `5n`. If a check arrives without a
  resolved range, fail loudly — do not recompute `5n`. Cover:
  non-5 cadence (`sf-omni-consultant` 12 checks, `ai-at-work` 6), touching/overlapping ranges, range end
  unpublished, check before lesson 1 / after the last, series with no checks, `desc` reversal.
  `checkState` returns `"passed" | "available"` only — **no `"locked"` value and no `mode` parameter**
  (no gating; architecture.md §4). Also pin the input conformance: all 90 `check-*.json` titles match `Lessons A–B`, so `quiz.ts:121`'s
  dormant `5n` fallback can never move a node today (architecture.md §9, ADR-303).
- **Evidence:** vitest output.

### A4 — One `/api/progress/quiz/tiers` fetch per series page
- **assignee:** steel · **parents:** none · **est:** 45 min
- **Done means:** `src/lib/hooks/useTierProgress.ts` exists; **all three**
  `/api/progress/quiz/tiers` callers on the series page use it (`CertReadiness`, `ExamCard`, and
  `CheckCardList` while it still exists, or `SeriesSyllabus` after A5 lands); a series page with three
  consumers issues **one** `/api/progress/quiz/tiers` request (today: three).
- **Body:** `api-contracts.md` §B.4 only. **No gate module:** do not create `src/lib/learn-gate.ts`,
  `LESSON_GATE_MODE`, `resolveLessonGate` or a `LessonGateMode` type, and do not add a `mode`/`blocked`
  prop anywhere — there is no lesson gating (architecture.md §4). Convert `CertReadiness`
  (`src/components/Progress/CertReadiness.tsx:27`, rendered on the series page at `page.tsx:284`) onto
  the hook as well — it is the third identical GET, and the "one request" criterion below is
  unreachable without it. It must keep rendering nothing while `tiers === null`.
  Do not delete `CheckCardList` yet (A5 does that).
- **Evidence:** a test that two hook consumers in one render produce one fetch; a component test that
  `CertReadiness` renders nothing on `null` and its stats on data; `grep -r "learn-gate\|LESSON_GATE_MODE\|resolveLessonGate" src/` returns nothing.

### A5 — Timeline node + syllabus interleaving
- **assignee:** steel · **parents:** [A3, A4, K1] · **est:** 45 min
- **Done means:** the series page shows each check as a node between its range end and the next lesson,
  the separate "Milestone checks" section is gone, sort and hide-completed still work.
- **Body:** `CheckTimelineNode` per `api-contracts.md` §B.5 and K1's spec; `SeriesSyllabus` takes
  `checks` + `series` + `kind` and interleaves via `buildTimeline`; hide rule = `hiddenByFilter`
  (D-5 recommended rule); `?sort=desc` reverses nodes with their position; first paint shows "Available"
  (hydration-gated, same as today). Delete `src/components/Progress/CheckCardList.tsx`, its
  `<CheckCardList>` usage on the series page and its import (`page.tsx:21`), and the now-dangling
  `vi.mock("@/components/Progress/CheckCardList", …)` stub at
  `src/app/atlas/[series]/page.degraded.test.tsx:120` — that test file is in this card's scope.
  Keep `ExamCard`. No fixed `min-w` on the node.
- **Evidence:** component tests (interleaving, desc, hide, aria-label per state); 360/390/768/1280
  screenshots; extend `page.overflow.test.ts` for the new node; `page.degraded.test.tsx` still
  passes with no reference to the deleted module.

### A6 — Server check scores + routing into the check
- **assignee:** steel · **parents:** [A3] · **est:** 45 min
- **Done means:** on a lesson that ends a check range, Next and the completion panel route into the check
  (or to lesson 6 when it is already passed), using authoritative `quiz_attempt` state.
- **Body:** extract `loadCheckScores`/`loadCheckScore` into `src/lib/check-scores.ts` and use it from
  `exam/page.tsx` (behaviour must not change) and the lesson page; pass `nextOverride` to
  `LessonNavigation`; add `MilestonePanel` between the practice questions and the sources. **No gate
  call, no `blocked`/`mode` prop, no locked branch:** the lesson body renders unconditionally whether or
  not the preceding check is passed (architecture.md §4). Guests: no query, no panel state.
- **Evidence:** page tests (lesson 5 → check 1; passed → lesson 6; guest → no pass state); exam page and
  certificate tests still green.

### A7 — Continue after a pass
- **assignee:** steel · **parents:** [A3] · **est:** 30 min
- **Done means:** passing a knowledge check offers "Continue to Lesson 6" as the primary results action;
  failing keeps retake primary.
- **Body:** `continueHref`/`continueLabel` on `QuizWidget` per `api-contracts.md` §B.5; the check page
  computes the target with `nextLessonAfter`. No pass logic added to the widget.
- **Evidence:** widget tests (pass/fail/no-props) + check page test.

### A8 — Sticky bar completion control
- **assignee:** steel · **parents:** [K2] · **est:** 45 min
- **Done means:** an authed learner can mark a lesson complete from the sticky audio bar, sees the real
  completed state, and the hero control and bar never disagree.
- **Body:** `trailing` slot on `AudioPlayer`/`AudioPlayerLazy`; new `MarkCompleteCompact` on
  `useLessonProgress` (same hook, same `/api/progress/lesson` write path); completed state = static
  `role="status"` chip, no toggle; layout per K2. Guests get nothing (locked card branch). Lessons with
  no narration get no bar (unchanged). No animation under reduced motion.
- **Evidence:** component tests (mark, complete chip, hero↔bar sync, guest absence) at 360/390/844×390;
  confirm exactly one POST to `/api/progress/lesson` per tap.

### A9 — Integration + viewport matrix evidence (Workstream A)
- **assignee:** steel · **parents:** [A2, A5, A6, A7, A8] · **est:** 45 min
- **Done means:** the whole A lane works end to end on desktop and mobile, with recorded evidence and a
  green suite.
- **Body:** walk a real `Tracks` lesson (AI at Work) and a real certification lesson (OmniStudio) plus one
  blog article (no-regression proof). Record: citations last, node in timeline, complete→check→pass→
  continue, sticky completion. Capture 390×844, 360×800, 768×1024 (P+L), 1280×800, 1440×900, and
  844×390 for the bar only. Run the full suite; confirm an already-complete learner's certificate page is
  unchanged. List every viewport with what was checked.
- **Evidence:** screenshot paths + `npx vitest run` summary + the viewport table in the completion metadata.

---

## Lane B — Steel (implementation). Item 3. Parallel with A.

### B1 — `examKind` field + build validation
- **assignee:** steel · **parents:** none · **est:** 45 min
- **Done means:** all 12 `series.json` carry `examKind`, the generator throws when it is missing/invalid,
  and `src/data/learn.ts` + `LearningSeries` expose it.
- **Body:** seed per the migration table in `architecture.md` §5.1 (`agentic-ai` = `course-completion`,
  D-2 pending). `build-learn.js` validates and emits; `tsconfig`-level type added. Run
  `node scripts/build-learn.js` and commit the regenerated module. A build test asserts a missing
  `examKind` throws.
- **Evidence:** generator output, `src/data/learn.ts` diff, new build test run.

### B2 — The label source
- **assignee:** steel · **parents:** [B1] · **est:** 30 min
- **Done means:** `src/lib/exam-labels.ts` exists with the copy in `api-contracts.md` §C and a 12-series
  unit matrix passing.
- **Body:** client-safe (type-only import), no series data, no inference. `examLabels(kind)` is total and
  never falls back to cert prep. Unit test: every series' kind maps to the expected `full`/`short`/
  `phrase`; `lockHeading(4)` uses 4 not 9.
- **Evidence:** vitest output.

### B3 — Sweep the exam surfaces
- **assignee:** steel · **parents:** [B2] · **est:** 45 min
- **Done means:** `ExamCard`, `ExamLocked`, `ExamWidget`, the exam page (guest + authed + kicker + meta +
  locked panel) and `GuestCTA`'s exam tier render from the label source, with counts and pass marks from
  props/constants.
- **Body:** `kind` + `questionCount` + `passPct` + `minutes` as props per `api-contracts.md` §C; replace
  hardcoded `72` with `CERT_EXAM_PASS_PCT`, `105` with `CERT_EXAM_MINUTES`, "all 9 knowledge checks" with
  the real count, "60 questions" with `exam.questions.length`. No literal "Certification Prep" left in
  these files.
- **Evidence:** component tests for a track series (no cert strings) and a cert series (strings present);
  screenshots at 360 and 1280 of the exam card + exam page header.

### B4 — Certificate, chronicle and SEO head
- **assignee:** steel · **parents:** [B2] · **est:** 30 min
- **Done means:** certificate copy, the certificate page, `chronicleLabel("exam")` and the exam page
  `<title>`/description are kind-aware.
- **Body:** `Certificate` + certificate page take `kind`; `lib/sky.ts` gains `ctx.examKind` with the
  neutral fallback ("exam passed") when absent — never cert prep by default; callers resolve the kind
  from the series slug. The exam head is composed from `examLabels(kind)`, **not** from `exam.json`
  `title` (ADR-309).
- **Evidence:** tests for both kinds on the certificate + chronicle + head; print styles checked for the
  old phrase.

### B5 — `exam.json` titles sweep
- **assignee:** steel · **parents:** [B2] · **est:** 30 min
- **Done means:** the 12 content titles match their kind and a test pins it.
- **Body:** track series → `<series name>: Course Completion Exam`; certification series keep their
  certification-naming title. Add the drift test (a series' title may not contain the other kind's
  label). Do not touch exam questions.
- **Evidence:** `git diff --stat content/learn/*/exam.json` + drift test output.

### B6 — 12-series label matrix + no-cert-prep grep test (Workstream B integration)
- **assignee:** steel · **parents:** [B3, B4, B5] · **est:** 45 min
- **Done means:** one matrix test renders every exam surface for all 12 series and asserts the correct
  label (and the absence of the other), plus a repo-wide grep test that no component hardcodes the label.
- **Body:** matrix over `learnSeries`; grep test over `src/components/Progress/**`, `src/app/atlas/**`,
  `src/lib/sky.ts` with an allow-list (`exam-labels.ts`, tests, design refs). Update
  `ExamWidget.test.tsx`, `Certificate.test.tsx`, `sky.test.ts` for the new props.
- **Evidence:** vitest output + a table of series → rendered label in the completion metadata.

---

## Content/tracking card (not implementation)

### C1 — Annotate the design reference files
- **assignee:** kara · **parents:** [K1, K2, K3] · **est:** 15 min
- **Done means:** `design/copy-deck-quiz-tiers.md`, `design/mockup-exam.html`,
  `design/mockup-exam-locked.html` carry a dated note that the exam label is kind-aware now and the old
  wording must not be copied into new work.
- **Body:** add the note; do not reword the mockups' content.

---

## Dependency graph (file in this order)

```
A1 → A2
A3 → A5, A6, A7
A4 → A5
K1 → A5
K2 → A8
A2, A5, A6, A7, A8 → A9

B1 → B2
B2 → B3, B4, B5
B3, B4, B5 → B6

K1, K2, K3 → C1
```

**Integration cards:** A9 (lane A) and B6 (lane B) — the two places parallel workstreams reconnect.
Neither can be filed before its parents exist.

---

## Handoff notes for each lane

**To Kara:** the architecture constrains size, states and viewports; you own layout, hierarchy, type
scale and the mobile decision on the bar's header row. Copy strings come from `examLabels(kind)` and are
Lois's — propose changes, do not edit the strings in code.

**To Steel:** the contracts in `api-contracts.md` are the seam. If a signature must change, update that
file in the same PR. Three hard rules: (1) no new write path for completion — only
`/api/progress/lesson` via `useLessonProgress`; (2) **no lesson gating of any kind** — no
`learn-gate.ts`, no `LESSON_GATE_MODE`, no `locked` state, no locked copy (architecture.md §4); a check
is placed in the timeline and routed to, never enforced; (3) do not decide D-2/D-3 — ship
`agentic-ai = course-completion` as seeded, flagged in the PR body.

**To Zod (QA):** acceptance requires desktop **and** mobile evidence per Amendment 1 (A2 viewport list).
An item with one viewport class is unfinished.
