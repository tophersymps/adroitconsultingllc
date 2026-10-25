# Final card list and wave sequencing — Learn lesson IA + exam naming

**Prepared by:** Lois (BA) · **Ticket:** `t_c5f264d4` · **Date:** 2026-10-25
**Source documents:** `cards.md` (the 19-card blueprint in this directory), `architecture.md`,
`api-contracts.md`, and the BA requirements spec
`~/Documents/Fortress-of-Solitude/requirements/adroit-site-learn-ux-exam-naming-2026-10-25.md`
(stories `US-001` … `US-015`).

**What this document is.** The reconciled, sequenced version of the 19 cards, organised into four
waves that open one at a time. A wave opens only when the previous wave has **merged** to `main` —
not when it has been reviewed, and not when it has been approved. Card bodies are taken verbatim
from `cards.md`; this document adds the wave, the dependency order, the desktop-and-mobile
acceptance criteria that Chris's Amendment 1 requires, and the reconciliation verdict for every
card.

**Decisions this document assumes (do not re-litigate in a card):**

| ID | Decision | Status |
|---|---|---|
| D-1 | **No lesson gating.** A check is placed in the timeline and the learner is routed into it; the following lesson always stays reachable. No gate module, no mode constant, no `Locked` state, no locked copy. | Decided by Chris, 2026-10-25 |
| D-5 | Hide-completed hides a check node only when it is passed **and** every lesson in its range is hidden. | BA recommendation, implemented as `hiddenByFilter` in A5 |
| D-2 | `agentic-ai` exam kind — content group says `Certifications`, but Chris named it among "our own courses". Seeded as `course-completion`, flagged for Chris in B1. | Open, Chris |
| D-3 | Pass mark for course-completion exams (72 % today vs the 80 % the checks use). | Open, product; **not touched by any card** |
| D-4 | Whether an exam email surface exists outside this repo. | Open; out of scope |
| D-6 | Whether the paywall peek (`PreviewFirstLesson`) follows the lesson rule for citations. See §6. | Open; recommended "leave unchanged" |

---

## 1. Reconciliation verdict on the 19 cards

All 19 are retained. **No card is removed**, because none builds gating and none adds a second
completion path — both were already scrubbed from the blueprint (commits `f8ce6e16` "drop lesson
gating per Chris's decision" and `63e…` discoverability). What is listed below is the audit that
proves it, plus the amendments this pass makes.

### 1.1 Gating and second-write-path audit

| Card | Gating risk | Second completion path | Verdict |
|---|---|---|---|
| K1 | Designs states `Passed` / `Available` only; explicitly forbids a locked badge, row treatment or copy | n/a (design) | Clean — keep |
| K2 | n/a | Design only | Clean — keep |
| K3 | n/a | n/a | Clean — keep |
| A1 | n/a (render split) | n/a | Clean — keep |
| A2 | n/a | n/a | Clean — keep |
| A3 | `checkState` returns `"passed" \| "available"`, no `"locked"` value, no `mode` parameter | n/a (pure module) | Clean — keep |
| A4 | "No gate module": no `learn-gate.ts`, no `LESSON_GATE_MODE`, no `resolveLessonGate`, no `mode`/`blocked` prop, with a grep assertion as evidence | n/a (read path) | Clean — keep |
| A5 | Node is a pure function of lessons + checks; no lock, no conditional presence | n/a | Clean — keep |
| A6 | "No gate call, no `blocked`/`mode` prop, no locked branch: the lesson body renders unconditionally" | Routes into the existing check route only | Clean — keep |
| A7 | Pass logic not added to the widget; the check page computes the target | No new write | Clean — keep |
| A8 | Guests get the existing locked card branch, nothing new | Explicitly the same hook and the same `POST /api/progress/lesson` | Clean — keep |
| A9 | n/a (integration) | Verifies one POST per tap | Clean — keep |
| B1–B5 | n/a (naming) | n/a | Clean — keep |
| B6 | n/a | n/a | Clean — keep |
| C1 | n/a (annotation) | n/a | Clean — keep |

**Explicitly not cards** (retired before this pass, recorded here so nobody re-files them): a gate
module (`learn-gate.ts`), a gate-mode constant, a `Locked` badge state, locked copy branches, and any
"advisory gate" switch. If a locked state is ever wanted it is a **new requirement with its own
discovery**, not a constant flip.

### 1.2 Amendments this pass makes to five cards

| Card | Amendment | Why |
|---|---|---|
| A7 | The pass decision and the results pill must both read the authoritative `quiz_attempt` source (the one the exam gate reads), not `quiz_run` | The blueprint's own known-issues note records that the check page's pass pill reads `quiz_run` while the exam gate reads `quiz_attempt`. A "Continue to Lesson 6" button that disagrees with the pill beside it is a defect the learner will see (`US-006`). Card scope only — no new pass logic |
| B3 | Keep the exam card correct in the R2-5 degraded path (token route rate-limited) | `US-012`: the label is derived from content data, which is available without the DB. Degraded rendering is a no-regression surface |
| B6 | Add the degraded-path assertion to the matrix, and include a `changelog.d/<ticket-id>.md` fragment | `US-012`, and `AGENTS.md` requires a fragment per PR instead of editing `CHANGELOG.md` |
| A2 | Preview and paywall-peek routes stay `inline` (unchanged) — see D-6 | Chris's item says "for lessons". The peek is a sales surface; changing it is out of scope for this release |
| A6 | The milestone panel must not introduce a second progress fetch on the lesson page — it reads the same server-side load as the navigation | The lesson page already pays for one progress read; `US-008` forbids new query paths |

---

## 2. Wave plan

Four waves. Each opens **only after the previous wave is merged to `main`**. Card counts total 19.

| Wave | Name | Cards | Assignees | Parallelism | Why this wave is one unit |
|---|---|---|---|---|---|
| **W0** | Blueprint | (docs PR **#408**) | brainiac | — | Every card cites the contracts. Wave 1 opens when #408 is merged. If Chris wants to move sooner, **B1 and B2 only** may start in parallel: both are additive, touch no shared surface, and are reversible by deleting a field |
| **W1** | Exam naming (Item 3) | B1 → B2 → {B3, B4, B5} → B6 | steel | 3 at the end | One workstream, one seam (`exam-labels.ts`), no shared file with the lesson work. Ships independently: every non-certification course stops calling its exam a certification prep exam |
| **W2** | Design + foundations | K1, K2, K3 · A1, A3, A4 | kara · steel | 6 parallel | Design specs must exist before A5/A8 can be built; A1/A3/A4 change no surface (blog output byte-identical, A3 is a pure module, A4 keeps rendering identical). A4 also rewires `ExamCard`, `CertReadiness` and `CheckCardList` — the same files W1's B3 edits — so it must not run beside W1 |
| **W3** | Surfaces (Items 1, 2, 4) | A2, A5, A6, A7, A8 | steel | 5 parallel | Every card has all its parents in W1/W2. This is the only wave where a learner-visible surface changes, so with mobile and desktop evidence it is one reviewable unit |
| **W4** | Integration + evidence | A9, C1 | steel · kara | 2 parallel | A9 needs all five W3 cards merged; C1 annotates the design references once the check node and the bar control are real |

### 2.1 Wave gates (what "merged" means here)

A wave is open when, for the previous wave:

1. Every card in it is `done` on the board, and
2. its PR is merged to `main` (not merely approved), and
3. `main` is deployed and the wave's own acceptance evidence was captured **on the deployed build**
   (mobile and desktop), and
4. no card in the wave was closed as "won't do" without Chris's sign-off.

If a wave produces a rework card, the wave re-opens for that card and the next wave waits.

### 2.2 Dependency graph (unchanged from `cards.md`, annotated with waves)

```
W0  #408 (docs)  ────────────────────────────────► unblocks W1

W1  B1 → B2 → B3, B4, B5 → B6

W2  A1    → (W3 A2)
    A3    → (W3 A5, A6, A7)
    A4    → (W3 A5)
    K1    → (W3 A5)
    K2    → (W3 A8)
    K3    → (W4 C1)

W3  A2, A5, A6, A7, A8 ──────────────────────────► W4

W4  A9 (needs A2 + A5 + A6 + A7 + A8)
    C1 (needs K1 + K2 + K3)
```

---

## 3. Wave 1 — Exam naming (Item 3)

**Goal:** AI at Work and every other Adroit-authored course calls its exam a course completion exam;
certification series keep today's wording; one label source replaces three hardcoded strings.
**Story coverage:** US-009, US-010, US-011, US-012.

### 3.0 Scope — every non-certification course, not just AI at Work

Chris, reviewing this plan: *"I want to make sure this isn't the scope of just the AI at Work
course, but all courses that are not actual certification courses."* AI at Work is the smoke
example in the acceptance lines below; it is **not** the scope. The scope is the whole
`course-completion` set, and B6's 12-series matrix is the proof.

Seeded classification (B1 writes this field for all 12 series; verify against the content, do not
infer from the `group` label alone):

| Series | Series name | Kind | Evidence |
|---|---|---|---|
| `ai-at-work` | AI at Work | `course-completion` | exam.json: "earn the course completion certificate" |
| `ai-adoption` | AI Adoption | `course-completion` | same |
| `ai-power-user` | AI Power User | `course-completion` | same |
| `hermes-consultant` | Hermes Agent Consultant | `course-completion` | same |
| `hermes-consultant-intermediate` | Hermes Agent Consultant · Intermediate | `course-completion` | same |
| `hermes-consultant-advanced` | Hermes Agent Consultant · Advanced | `course-completion` | same |
| `agentic-ai` | Agentic AI Implementation Path | `course-completion` **(confirm)** | group says `Certifications`, but it is Adroit-authored and its exam.json says "course completion certificate" |
| `salesforce-architect` | Salesforce System Architect Primer | `course-completion` **(confirm)** | group says `Certifications`, exam.json says "course completion certificate" with no blueprint weights |
| `omni-studio-cert` | OmniStudio Developer Certification | `certification-prep` | exam.json mirrors "the official Spring '26 OmniStudio Developer blueprint domain weights" |
| `salesforce-data-architect` | Platform Data Architect Certification | `certification-prep` | same |
| `salesforce-sharing-visibility-architect` | Platform Sharing and Visibility Architect Certification | `certification-prep` | same |
| `sf-omni-consultant` | Salesforce OmniStudio Consultant Certification | `certification-prep` | same |

Two flags for Chris, both set to `course-completion` in this plan and both one content field to
change if he disagrees:

- **`agentic-ai`** — `group: Certifications` but Adroit-authored, and its own exam says course
  completion. Classified course-completion.
- **`salesforce-architect`** — "Salesforce System Architect Primer". Salesforce does run a System
  Architect credential programme, so this one could legitimately be prep; its exam content says
  course completion with no blueprint weights. Classified course-completion, flagged because the
  group label disagrees with the content.

**Rule for the implementers:** the kind is decided per series from content evidence, and the label
follows the kind. Do not key the label off `group` (it is stale and wrong for `agentic-ai`), and do
not special-case AI at Work. The `exam.json` description is an additional consistency signal: a
`course-completion` series must not describe itself against an official exam blueprint.


### B1 — `examKind` field + build validation
- **assignee:** steel · **parents:** none · **est:** 45 min · **no surface change**
- **Body:** verbatim from `cards.md` §B1. Seed per `architecture.md` §5.1; `agentic-ai` =
  `course-completion` (D-2 pending, flag in the PR body).
- **Acceptance — desktop:** n/a, no surface rendered. Correctness evidence is the regenerated
  `src/data/learn.ts` diff plus a build test that a missing `examKind` throws.
- **Acceptance — mobile:** n/a, same reason.
- **Done means:** all 12 `series.json` carry `examKind`; the generator throws on missing or invalid;
  `src/data/learn.ts` and `LearningSeries` expose it.

### B2 — The label source
- **assignee:** steel · **parents:** [B1] · **est:** 30 min · **no surface change**
- **Body:** verbatim from `cards.md` §B2; copy table is `api-contracts.md` §C (Lois owns wording).
- **Acceptance — desktop / mobile:** n/a, module only. Evidence is the 12-series unit matrix.
- **Done means:** `src/lib/exam-labels.ts` is client-safe, total, never falls back to cert prep;
  `lockHeading(4)` uses 4 not 9.

### B3 — Sweep the exam surfaces
- **assignee:** steel · **parents:** [B2] · **est:** 45 min · **changes a surface**
- **Body:** verbatim from `cards.md` §B3, plus the amendment: the exam card must render the correct
  label in the R2-5 degraded path (token route rate-limited) on a Tracks series (`US-012`).
- **Acceptance — desktop (1280×800 and 1440×900):**
  - Given **every course-completion series** (`ai-at-work`, `ai-adoption`, `ai-power-user`,
    `hermes-consultant`, `hermes-consultant-intermediate`, `hermes-consultant-advanced`,
    `agentic-ai`, `salesforce-architect`), when the series page and the exam page render, then the
    exam card kicker and heading read "Course Exam" / "Course Completion Exam", the exam page
    header, meta, guest CTA and locked panel use the same wording, and no element on either page
    says "Certification Prep", "Cert Prep" or "cert prep". AI at Work alone does not satisfy this.
  - Given any certification series, when the same surfaces render, then the wording is identical to
    today, character for character.
  - Given either series, when I compare the card and page header against the pre-change build, then
    no layout box moved (screenshot pair, same viewport).
- **Acceptance — mobile (390×844 and 360×800, plus 768×1024 portrait):**
  - Given each course-completion series at 360 px (AI at Work as the smoke case), when the exam card
    renders, then "Course Completion Exam" wraps without clipping or ellipsis, the card grows in
    height rather than width, and the page has no horizontal scroll.
  - Given the exam page at 360 px, when the header and kicker render, then both are legible at the
    existing type scale and the guest CTA keeps its full-width button.
  - Given 768×1024 landscape, then the card and header keep the desktop arrangement with no reflow
    overlap.
- **Done means:** no literal "Certification Prep" left in these files; counts and pass marks come
  from props/constants.

### B4 — Certificate, chronicle and SEO head
- **assignee:** steel · **parents:** [B2] · **est:** 30 min · **changes a surface**
- **Body:** verbatim from `cards.md` §B4.
- **Acceptance — desktop (1280×800):**
  - Given a learner who completed **any course-completion series**, when the certificate page renders,
    then the copy says "course completion exam" and the page `<title>` and description say "Course
    Completion Exam". AI at Work is the smoke case; the other seven are covered by the B6 matrix.
  - Given the same certificate printed to PDF, then no page of it contains "cert prep".
  - Given a certification series, then the certificate, chronicle and head are unchanged.
- **Acceptance — mobile (360×800 and 390×844):**
  - Given the certificate page at 360 px, then the copy block reflows without clipping the label and
    print-to-PDF from that width keeps the correct phrase.
  - Given the chronicle entry in the progress view, then the label is correct at both widths.
- **Done means:** `Certificate` + certificate page take `kind`; `sky.ts` `ctx.examKind` degrades to
  "exam passed", never to cert prep; the head is composed from labels (ADR-309).

### B5 — `exam.json` titles sweep
- **assignee:** steel · **parents:** [B2] · **est:** 30 min · **changes content (title surface)**
- **Body:** verbatim from `cards.md` §B5. Track series → `<series name>: Course Completion Exam`;
  certification series keep their certification title.
- **Acceptance — desktop (1280×800):** given **each course-completion series**, when the exam page
  loads, then the browser tab reads "<series>: Course Completion Exam | Adroit Learn"; given
  OmniStudio, the tab is unchanged.
- **Acceptance — mobile (360×800):** the head is server-rendered and viewport-independent, so
  evidence is the same title read from a 360 px user agent, plus a check that no visible title block
  on the page changed state.
- **Done means:** 12 titles match their kind, pinned by the drift test.

### B6 — 12-series label matrix + no-cert-prep grep test (Wave 1 integration)
- **assignee:** steel · **parents:** [B3, B4, B5] · **est:** 45 min · **integration**
- **Body:** verbatim from `cards.md` §B6, plus: assert the degraded (R2-5) series page renders the
  correct label for a Tracks series and a certification series; add `changelog.d/<ticket-id>.md`.
- **Acceptance — desktop + mobile:** the matrix is viewport-independent, so this card's responsive
  evidence is the assembled B3/B4/B5 screenshots at 1280×800, 1440×900, 768×1024, 390×844 and
  360×800, plus one new degraded-mode pair (1280 and 360) showing the correct exam card label.
- **Done means:** matrix over all 12 series passes; grep test finds no hardcoded label outside the
  allow-list; the wave's changelog fragment exists.

**Wave 1 exit criteria — the whole course-completion set, not AI at Work:**

- Every one of the eight `course-completion` series (`ai-at-work`, `ai-adoption`, `ai-power-user`,
  `hermes-consultant`, `hermes-consultant-intermediate`, `hermes-consultant-advanced`, `agentic-ai`,
  `salesforce-architect`) says "Course Completion Exam" on the exam card, the exam page header, the
  certificate, the chronicle and the browser tab, at desktop and mobile widths. AI at Work passing on
  its own does **not** satisfy this criterion.
- Every one of the four `certification-prep` series (`omni-studio-cert`, `salesforce-data-architect`,
  `salesforce-sharing-visibility-architect`, `sf-omni-consultant`) keeps its current wording, character
  for character.
- The B6 matrix and the repo-wide grep test are green over all 12 series, and the matrix table in the
  PR body lists series → rendered label so a reviewer can see every row.
- The degraded exam card (R2-5 token route rate-limited) renders the correct label on a Tracks series.
- The PR is merged and deployed.

---

## 4. Wave 2 — Design + foundations

**Goal:** the design specs the surface work depends on, plus the three no-surface-change modules.
**Story coverage:** US-001/US-002 (via A1), US-004 (via A3), US-008 (via A4), K1–K3 carrier for
US-004/US-013/US-015.

### K1 — Design: milestone check node in the syllabus timeline
- **assignee:** kara · **parents:** none · **est:** 45 min · **design deliverable**
- **Body:** verbatim from `cards.md` §K1.
- **Acceptance — desktop (1280×800, and 1440×900 if the layout is fluid):** the mockup shows the node
  between lesson 5 and lesson 6, visually distinct from a lesson row, with a `Passed · 87%` and an
  `Available` badge; no `Locked` badge exists anywhere in the file.
- **Acceptance — mobile (360×800, 390×844, 768×1024 portrait + landscape):** the mockup renders with
  a row height of at least 44 px, the state badge stays readable when the range label is long (no
  truncation of the badge), nothing is colour-only, and the syllabus has no horizontal scroll at
  360 px.
- **Discoverability acceptance (the point of Item 2):** the mockup shows the node at **zero
  progress** — that is the primary state, not an edge case. It must not read as a reveal, a
  collapsed item, or something that appears only at range completion.
- **Done means:** `design/check-timeline-node.md` + `design/mockup-check-node.html`.

### K2 — Design: completion control in the sticky audio bar
- **assignee:** kara · **parents:** none · **est:** 45 min · **design deliverable**
- **Body:** verbatim from `cards.md` §K2.
- **Acceptance — desktop (1280×800):** the control sits in the bar's header row, is at least 44×44 px,
  and does not shrink the audio element; the completed state is a static chip.
- **Acceptance — mobile (360×800, 390×844):** the two-row header layout is resolved and shown with
  the control's exact position relative to Follow-along and Speed; the control keeps its 44×44 tap
  target; the audio element stays full width.
- **Acceptance — landscape phone (844×390):** the compact form is shown and the bar does not eat the
  reading area.
- **Done means:** `design/sticky-complete-control.md` + `design/mockup-sticky-complete.html`;
  no animated state change under reduced motion.

### K3 — Design: lesson sources at the very bottom (incl. anchor offsets)
- **assignee:** kara · **parents:** none · **est:** 30 min · **design deliverable**
- **Body:** verbatim from `cards.md` §K3.
- **Acceptance — desktop (1280×800):** the mockup shows body → practice questions → check panel →
  Sources, with Sources visibly separate from the exercise.
- **Acceptance — mobile (360×800):** long source URLs wrap (`overflow-wrap`) with no horizontal
  scroll and the footnote back-reference arrows keep a usable tap target (≥ 44 px, or 24 px with
  spacing).
- **Done means:** `design/lesson-sources-bottom.md`; one CSS custom property states the
  `scroll-margin-top` value used so an anchor jump is not hidden under the sticky bar.

### A1 — MDX body/sources split (Item 1 foundation)
- **assignee:** steel · **parents:** none · **est:** 45 min · **no intended surface change**
- **Body:** verbatim from `cards.md` §A1; implements `api-contracts.md` §A.1–§A.4.
- **Acceptance — desktop + mobile:** no surface changes by design. Proof is a before/after screenshot
  pair of one blog article (`/field-notes/[slug]`) and one lesson at 1280×800 **and** 360×800, plus a
  byte-identical blog render assertion. `MDXArticle` default stays `"inline"`.
- **Done means:** `lesson-sources.ts`, `footnote-plugins.ts`, `MDXSources.tsx` and the `sources` prop
  exist with the four tests green; `MDXSources` returns `null` when there are no footnotes.

### A3 — Lesson↔check mapping module
- **assignee:** steel · **parents:** none · **est:** 45 min · **no surface change**
- **Body:** verbatim from `cards.md` §A3; `api-contracts.md` §B.1.
- **Acceptance — desktop / mobile:** n/a, pure module. Evidence is the vitest edge-case set
  (non-5 cadence, touching ranges, unpublished range end, check outside the lesson list, no checks,
  `desc`).
- **Done means:** `lesson-checks.ts` + tests; `checkState` returns `"passed" | "available"` only.

### A4 — One `/api/progress/quiz/tiers` fetch per series page
- **assignee:** steel · **parents:** none · **est:** 45 min · **no intended surface change**
- **Body:** verbatim from `cards.md` §A4, including the grep assertion that no gate module exists.
- **Acceptance — desktop + mobile:** the series page must render identically before and after at
  1280×800 and 360×800 (screenshot pair), with the network panel showing one
  `/api/progress/quiz/tiers` request instead of three. `CertReadiness` still renders nothing while
  `tiers === null`.
- **Done means:** `useTierProgress.ts` serves all three consumers.

**Wave 2 exit criteria:** three design specs committed under `design/` with the viewport sets above;
A1/A3/A4 merged with byte-identical or screenshot-identical surfaces and one tiers request per series
page; all PRs merged and deployed.

---

## 5. Wave 3 — Surfaces (Items 1, 2, 4)

**Goal:** the learner-visible change. **Story coverage:** US-001, US-002, US-004, US-005, US-006,
US-007, US-013, US-014, US-015.

### A2 — Lesson page composition: citations last
- **assignee:** steel · **parents:** [A1] · **est:** 30 min · **changes a surface**
- **Body:** verbatim from `cards.md` §A2, plus: preview routes and `PreviewFirstLesson` stay `inline`
  (D-6 — do not change them in this release).
- **Acceptance — desktop (1280×800 and 1440×900):**
  - Given a lesson whose series has a check covering it, when it renders, then the DOM order is body,
    practice questions, check affordance, **Sources**, then prev/next navigation, and Sources is the
    last content block.
  - Given a lesson outside any check range, then Sources still renders after the practice questions
    and nothing lesson-related follows it except navigation.
  - Given a footnote back-reference is clicked, then the target lands below the sticky bar (not
    hidden under it).
  - Visual order equals DOM order: no CSS `order`, no `flex-direction: reverse`, no absolute
    positioning.
- **Acceptance — mobile (360×800 and 390×844):**
  - Given the same lesson at 360 px, then Sources is still the last block, long URLs wrap with no
    horizontal scroll, and the back-reference targets remain tappable.
  - Given a lesson with no footnote definitions, then no empty "Sources" heading appears at either
    width.
- **Done means:** page test asserts DOM order and a single `section[data-footnotes]`; screenshots at
  360 and 1280.

### A5 — Timeline node + syllabus interleaving
- **assignee:** steel · **parents:** [A3, A4, K1] · **est:** 45 min · **changes a surface**
- **Body:** verbatim from `cards.md` §A5 — including deleting `CheckCardList`, its usage
  (`page.tsx:21`) and the dangling `vi.mock` stub in `page.degraded.test.tsx:120`, which is in this
  card's scope. Keep `ExamCard`.
- **Acceptance — desktop (1280×800 and 1440×900):**
  - Given AI at Work with zero progress, when the series page first renders, then check 1 appears as
    a node between lesson 5 and lesson 6 marked `Available`, **before** any tiers response arrives.
  - Given a learner who passed check 1, then the node reads `Passed · <score>`.
  - Given the page, then no separate "Milestone checks" section exists, `?sort=desc` moves the node
    with its position, and hide-completed follows D-5.
- **Acceptance — mobile (360×800, 390×844, 768×1024 portrait + landscape):**
  - Given the same zero-progress learner at 360 px, then the node is visible without scrolling past
    it, the row is at least 44 px tall, the badge is not colour-only, and the syllabus has no
    horizontal scroll.
  - Given a long range label at 360 px, then the state badge is not truncated.
- **Done means:** component tests (interleaving, desc, hide, aria-label per state, zero-progress
  first render); `page.overflow.test.ts` extended; `page.degraded.test.tsx` passes with no reference
  to the deleted module.

### A6 — Server check scores + routing into the check
- **assignee:** steel · **parents:** [A3] · **est:** 45 min · **changes a surface**
- **Body:** verbatim from `cards.md` §A6, plus: the milestone panel and the navigation must share the
  one server-side progress read already made for the lesson page — no second fetch (US-008).
- **Acceptance — desktop (1280×800):**
  - Given a learner on lesson 5 (range end of check 1) who has not passed it, when the page renders,
    then the completion panel presents check 1 as the primary action and Next targets
    `/atlas/[series]/check/1`.
  - Given the learner already passed check 1, then Next targets lesson 6.
  - Given a guest, then there is no pass state, no query beyond today's, and the lesson body renders
    normally.
  - Given any learner, then lesson 6 is reachable by its own syllabus row and by direct URL — no
    lock, no blocked branch.
- **Acceptance — mobile (360×800 and 390×844):**
  - Given lesson 5 at 360 px, then the milestone panel stacks below the practice questions, its
    primary action is at least 44 px tall and full width, and it is not covered by the sticky audio
    bar at any scroll position.
- **Done means:** `loadCheckScores`/`loadCheckScore` extracted to `src/lib/check-scores.ts` and used
  by the exam page (behaviour unchanged) and the lesson page; `nextOverride` on `LessonNavigation`.

### A7 — Continue after a pass
- **assignee:** steel · **parents:** [A3] · **est:** 30 min · **changes a surface**
- **Body:** verbatim from `cards.md` §A7, plus the amendment: the pass decision driving
  `continueHref` must read the authoritative `quiz_attempt` source — the same one the exam gate
  reads — so the results pill and the continue action cannot disagree.
- **Acceptance — desktop (1280×800):**
  - Given a pass, then the results view's primary action is "Continue to Lesson 6" and one click
    lands on lesson 6.
  - Given a fail, then retake remains primary, no continue action is offered, and the learner stays
    on the check route.
- **Acceptance — mobile (360×800 and 390×844):**
  - Given either state at 360 px, then the primary action is full width, at least 44 px tall, and is
    the first focusable action in the results block; the aria-label names the destination lesson.
- **Done means:** `continueHref`/`continueLabel` on `QuizWidget`; no pass logic added to the widget.

### A8 — Sticky bar completion control
- **assignee:** steel · **parents:** [K2] · **est:** 45 min · **changes a surface**
- **Body:** verbatim from `cards.md` §A8 — `trailing` slot on `AudioPlayer`/`AudioPlayerLazy`, new
  `MarkCompleteCompact` on `useLessonProgress`, the same `/api/progress/lesson` write path, static
  `role="status"` chip when complete, no toggle, guests get the existing locked branch, lessons with
  no narration get no bar.
- **Acceptance — desktop (1280×800, 1440×900):**
  - Given an authed learner mid-scroll and at the bottom of a lesson, when the bar is visible, then
    "Mark complete" is present and one activation records completion with exactly one POST to
    `/api/progress/lesson` and no reload.
  - Given the lesson was already completed, then the bar shows the completed chip on first paint and
    the hero control and the bar never disagree after either is toggled.
- **Acceptance — mobile (360×800, 390×844, 768×1024) and landscape phone (844×390):**
  - Given 360 px, then the control keeps a 44×44 tap target, the header row wraps per K2 without
    shrinking the audio element, and the bar does not cover the last line of the lesson body, the
    practice questions, the milestone panel or the citations block at any scroll position including
    the very bottom.
  - Given a 360 px screen reader pass, then the control has an accessible name naming the lesson,
    follows the player controls in focus order, and announces the state change.
  - Given 844×390, then the compact form is used and the reading area is not eaten.
  - Given reduced motion, then the state change is not animated.
- **Done means:** tests for mark, completed chip, hero↔bar sync and guest absence; layout per K2.

**Wave 3 exit criteria:** on a deployed build, a learner can read a lesson with citations last, see
check 1 in the timeline before reaching it, be routed into the check from lesson 5, continue to
lesson 6 after passing, and mark the lesson complete from the sticky bar — all at desktop and mobile
widths, with screenshots for each.

---

## 6. Wave 4 — Integration and evidence

### A9 — Integration + viewport matrix evidence (lane A)
- **assignee:** steel · **parents:** [A2, A5, A6, A7, A8] · **est:** 45 min · **integration**
- **Body:** verbatim from `cards.md` §A9.
- **Acceptance — desktop:** 1280×800 and 1440×900 for every screen in the walk (series page, lesson,
  check results, exam, certificate), each listed in the completion metadata with what was checked.
- **Acceptance — mobile:** 390×844, 360×800, 768×1024 portrait + landscape, plus 844×390 for the bar
  only. QA rejects evidence that covers a single viewport class.
- **No-regression acceptance:** one blog article and its preview render unchanged; the degraded R2-5
  series page still renders; an already-complete learner's certificate page is unchanged.
- **Done means:** the viewport table, screenshot paths and `npx vitest run` summary are in the
  handoff.

### C1 — Annotate the design reference files
- **assignee:** kara · **parents:** [K1, K2, K3] · **est:** 15 min · **no surface change**
- **Body:** verbatim from `cards.md` §C1 — a dated note on `design/copy-deck-quiz-tiers.md`,
  `design/mockup-exam.html` and `design/mockup-exam-locked.html` that the exam label is kind-aware and
  the old wording must not be copied.
- **Acceptance — desktop / mobile:** n/a, documentation only.

**Release exit criteria:** A9 and C1 merged; the four wave PRs are on `main` and deployed; the
release changelog fragments are present; D-2 is answered by Chris (or explicitly carried as
"seeded, pending" in the release notes).

---

## 7. Desktop-and-mobile acceptance standard (applies to every card above)

Chris's Amendment 1 is a cross-cutting acceptance requirement, not a fifth item. For this card list
it means:

| Viewport | Widths | Required on |
|---|---|---|
| Mobile (small Android) | 360 × 800 | every surface-changing card |
| Mobile (iPhone 14 class) | 390 × 844 | every surface-changing card |
| Tablet | 768 × 1024, portrait **and** landscape | every surface-changing card |
| Desktop | 1280 × 800 | every surface-changing card |
| Large desktop | 1440 × 900 | A2, A5, A8, A9, B3, B4 |
| Landscape phone | 844 × 390 | A8 (sticky bar), K2 |

An item is unfinished if its evidence covers one viewport class. "Looks fine" without a width is not
evidence. Reflow must be checked at 320 px even though it is not a target width.

---

## 8. Story → card traceability

| Story | Requirement | Cards |
|---|---|---|
| US-001 | Citations last on a milestone lesson | A1, A2 |
| US-002 | Citations last on a lesson with no check | A1, A2 |
| US-003 | Blog and preview citation placement unchanged | A1 (byte-identical assertion), A9 (no-regression) |
| US-004 | Checks appear in sequence in the syllabus | K1, A3, A5 |
| US-005 | Completing the range-end lesson routes into the check | A3, A6 |
| US-006 | Passing continues to the next lesson in one action | A3, A7 |
| US-007 | Failing leaves the learner with a retry path | A7 |
| US-008 | Certificate and progress logic unchanged for a completed learner | A4, A6, A9 |
| US-009 | A Tracks course never says "certification prep" | B1, B2, B3, B4, B5, B6 |
| US-010 | A certification series keeps its cert-prep framing | B2, B3, B4, B5, B6 |
| US-011 | One data field drives every label | B1, B2, B6 |
| US-012 | Degraded mode still labels the exam correctly | B3 (amendment), B6 (amendment) |
| US-013 | Mark complete from the sticky bar | K2, A8 |
| US-014 | Completed state is real, not optimistic | A8 |
| US-015 | The control is reachable and does not cover content | K2, A8, A9 |

---

## 9. Scope boundaries

**In scope:** lesson page composition (citations last, milestone panel, sticky completion), series
syllabus check nodes, exam naming across all listed surfaces, tests including the 12-series matrix,
and the desktop/mobile evidence for each.

**Out of scope (do not file a card):** rewriting lesson or exam content beyond `exam.json` titles;
any change to the 80 % check rule or the 72 % exam rule (D-3); any lesson-level authorization model;
blog citation placement and blog naming; design file rework beyond the C1 annotation; emails or
marketing copy outside the app (D-4).

**Accepted limitations, documented so QA does not file them as bugs:**

- Lessons with no narration have no audio bar, so the hero completion control stays the only way to
  mark them. Chris's item is about the bar; adding a second sticky element was rejected (US-013 edge
  case).
- Guests see the existing locked player card, so no completion control in the bar. Guests keep the
  hero control and localStorage behaviour.
- The paywall peek keeps citations inside the article body (D-6).
- A check node never hides a lesson and a lesson never hides a check: there is no locked state
  anywhere in this release (D-1).

---

## 10. Open questions carried to Chris

| ID | Question | Default shipped if unanswered |
|---|---|---|
| D-2 | Is `agentic-ai` a certification prep course or one of our own? Its content group says `Certifications`; the brief names it among "our own courses". | `course-completion`, seeded in B1 and flagged in the PR body; asking Chris to confirm or correct one content field |
| D-3 | Should a course-completion exam pass at 72 % or at the 80 % used by checks? | 72 % unchanged — this release is naming only |
| D-4 | Is there an exam email surface outside this repo using the old wording? | Out of scope; flagged for whoever owns marketing |
| D-6 | Should the paywall peek (`PreviewFirstLesson`) move citations to the bottom too? | Unchanged in this release (preview stays `inline`) |
| D-7 | After this release, the check page's pass pill reads `quiz_run` while the exam gate reads `quiz_attempt`. A7 aligns the continue action with `quiz_attempt`; the pill itself is untouched. | Flagged for a separate card; not fixed here |

---

## 11. Handoff

**To Krypto (filing):** file **Wave 1 only** — B1, B2, B3, B4, B5, B6 — with the bodies from
`cards.md` and the acceptance additions in §3 of this document. Do not file Waves 2–4 yet: the wave
gate is a constraint Chris set, and pre-filed cards invite parallel starts. Wave 2 is filed the day
Wave 1 merges.

**To Steel:** `api-contracts.md` is the seam; if a signature must change, change that file in the same
PR. Three hard rules: no new write path for completion (only `/api/progress/lesson` through
`useLessonProgress`); **no lesson gating of any kind** (no `learn-gate.ts`, no `LESSON_GATE_MODE`, no
`locked` state, no locked copy); do not decide D-2 or D-3 — ship the seeded `agentic-ai` value and
flag it in the PR body.

**To Kara:** the architecture constrains size, states and viewports; you own layout, hierarchy, type
scale, and the mobile decision on the bar's header row. Copy strings come from `examLabels(kind)` and
are Lois's — propose changes, do not edit the strings in code. K1 is the card that decides whether
Item 2 works: the node must be visible at zero progress.

**To Zod (QA):** acceptance requires desktop **and** mobile evidence per card (§7). A card with one
viewport class is unfinished. The accepted-limitations list in §9 is not a defect list.

**Changelog:** every PR adds `changelog.d/<ticket-id>.md`; do not edit `CHANGELOG.md`.
