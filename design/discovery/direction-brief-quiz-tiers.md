# Adroit Blog — Design Discovery: Quiz Tiers + Gating + Certificate UX

**Task:** t_e9c5c72d · **Author:** kara (designer) · **Date:** 2026-08-10
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Parent:** t_c4510a83 (plan) · **Child (execution):** t_0809d7ff
**Governing specs:** `docs/course-progression-pattern.md`, `docs/requirements-quiz-tiers.md`
**Type:** DISCOVERY — direction brief + mood board + additive tokens. The EXECUTION task (t_0809d7ff) composes the mockups from this brief.

---

## 0. What This Discovery Covers

Seven scope items, one shared language — **the quiz tiers are one system, not three separate products**:

1. Lesson quiz embed (in the lesson page's Practice Questions section)
2. Knowledge check pages + check card list on the series page (pass ≥80%)
3. Exam mode — 105 min timer, no-feedback flow, auto-submit at zero, results screen (pass ≥72%)
4. Guest CTA placeholder (gating)
5. Exam locked state ("Unlock: complete all 9 knowledge checks with 80%+")
6. Certificate layout (printable, NO image generation)
7. Lesson ordering by lesson number + "Hide completed" filter

Builds **ON** the shipped design pass (t_e3c87690 + t_7e4e4898 discovery): navy `#0B1D3A` / red `#C8102E` palette, Inter + JetBrains Mono, shadow-card elevation, article-body typography, motion language (micro 120ms / std 220ms / moment 450ms), and the existing quiz tokens + `QuizWidget.tsx`. Nothing from those passes is redone.

---

## 1. Surface Archetypes (committed before tokens)

| Scope item | Surface | Why |
|---|---|---|
| Lesson quiz embed | **Operate** (primary) inside Decide/Learn host | The lesson page is a reading surface; the quiz is a focused answering moment — selection state + one submit affordance + feedback. It must NOT feel like a dashboard or a marketing hero. |
| Knowledge check page | **Operate** (question flow) + **Monitor** (progress row) | Same widget family, slightly more formal framing (tiered milestone). Pass state is a Monitor signal — glanceable badge, not a monument. |
| Check card list (series page) | **Monitor** | Watching completion state per check (passed / not / best score). Cards are status rows, not feature tiles. |
| Exam mode | **Command/Operate** | Timed, no-feedback, one object at a time — speed and focus dominate. The timer IS the signature element. |
| Guest CTA placeholder | **Decide/Learn** | The ONLY place a pitch is correct: one idea (create an account to practice + track), one CTA. It replaces the quiz, so it must hold the same visual weight to avoid layout jump. |
| Exam locked state | **Monitor** | Per-check unlock progress, glanceable. Status first, action second. |
| Certificate | **Decide/Learn** (ceremonial document) | A document to be printed and believed — restrained, formal, one object. No marketing framing, no image generation. |
| Ordering / filter (series page) | **Explore** | Browsing lessons with sort + filter semantics. Reuses the existing pill/segmented language. |

**Anti-slop consequence:** no hero + three feature cards anywhere. The series page keeps its gradient hero panel (existing), then reads as a syllabus + progress dashboard. The exam is a focused Command surface with a persistent timer, not a card grid.

---

## 2. The One-Line Direction

> **"One quiz system, three registers of pressure."** Every tier speaks the same design language (mono kickers, red/emerald state colors, segment progress, score ring) but with escalating formality: the lesson quiz is a friendly practice card, the knowledge check is a milestone with a pass badge, and the exam is a navy-timered, no-feedback gauntlet that resolves into a score-ring verdict. The certificate is the quiet, formal reward at the end.

Reference vocabulary (from popular-web-designs, used for *principles* not copies):
- **Linear** — status discipline: one accent reserved for interactive/active, ultra-thin borders, density without clutter. Applies to the exam lock list + timer.
- **Sanity** — dual-register type: tight editorial display + mono technical labels. We already have this (Inter + JetBrains Mono); the exam timer leans harder on mono readouts.
- **Mintlify / Notion** — learning content recedes so the material leads; progress is quiet, not gamified. Applies to the lesson embed + check page.

---

## 3. Design Decisions Per Scope Item

### 3.1 Lesson quiz embed (Practice Questions section)

- **Keep the existing QuizWidget anatomy verbatim**: mono kicker (red tick + `Quiz`), segment progress bar, 4-option radio rows, "Why" explanation panel, score ring results card, Retake.
- **Embed fit:** the widget already renders at `max-w-[640px]` with `rounded-[20px] border-gray-200 bg-white p-7 shadow-sm`. On the lesson page it sits inside the `max-w-[720px]` article column — the 640px card aligns to the article measure, leaving a consistent gutter. No hero framing, no extra section chrome: a section rule + `## Practice Questions`-style mono header is enough (execution task decides exact header).
- **Tier differentiation:** lesson quiz keeps **red** as the *motion* color in the segment bar (in-progress/current) and emerald for correct — exactly what QuizWidget does today. No change.
- **New micro-detail (small, worth it):** the quiz card gets the same `shadow-card` resting elevation as PostCard, and the segment bar segments get a `transition-colors duration-200` fill — already present. Nothing else changes for this tier.

### 3.2 Knowledge check pages + check card list

- **Check page** (`/learn/[series]/check/<n>`): same Operate flow as the lesson quiz (QuizWidget reused, 15 questions). Framing changes to mark a milestone:
  - Mono kicker becomes `KNOWLEDGE CHECK` with the check number: e.g. red tick + `Knowledge Check 3 · Lessons 11–15`.
  - A slim pass-status row under the kicker (Monitor signal): emerald `Passed · 87% best` OR neutral `Not yet passed · 80% required` with a thin progress hint. Quiet — one line, no trophy.
  - The results screen shows the score ring + pass/fail callout. Pass = emerald ring + `Passed` label; fail = red ring + `Keep going — 80% required` + Retake button.
- **Check card list (series page):** a compact row list (not a tile grid) under the existing syllabus, headed by a mono section label like `Knowledge Checks · 3/9 passed`:
  - Each row: sequence badge (`K1`..`K9` mono chip), title `Knowledge Check 1 — Lessons 1–5`, right-aligned status: emerald `Passed · 87%` pill OR neutral `Not taken` / red `72% · retake`.
  - Rows link to `/learn/[series]/check/<n>`. Guests see the same rows (cards are visible) but links lead to the guest CTA page.
- **Progress vocabulary:** reuse `--progress-track` (gray-200) + emerald for passed fill; red only for the *current/active* state.

### 3.3 Exam mode (Command/Operate)

- **Page shell:** full-height, calm, nothing marketing. Header row: mono `CERT PREP EXAM` kicker + `60 questions · 105 minutes` meta.
- **Timer (the signature element):**
  - Sticky top bar, navy `#0B1D3A` background, white mono countdown `105:00` in JetBrains Mono `tabular-nums`, label `Time remaining`.
  - **Warning state:** under 10 minutes the countdown flips to red (`#C8102E` on navy) + a soft pulse (respect `prefers-reduced-motion`). Under 2 minutes it can bump to `--red-light` and the pulse stays.
  - Auto-submit at zero: a one-line note under the timer (`Auto-submits at 00:00`) so the behavior is discoverable without a modal.
- **Question flow:** same QuizWidget option rows, but **no-feedback**: after selecting, the primary button is `Next question` (or `Submit exam` on the last), and NO correct/wrong styling, NO explanation panel, NO segment color change per answer (segments stay gray → navy when answered, not red/green). Answer review happens only on the results screen.
- **Progress:** a thin segment bar (60 segments) + `Question 12 of 60` mono label. Answered segments fill navy; unanswered stay gray. No correctness coloring during the exam.
- **Results screen:**
  - Score ring (existing component) scaled up (`w-40`), fill = emerald on pass (≥72%), red on fail.
  - Verdict line: `Passed · 78%` emerald OR `Not passed · 64% — 72% required` red.
  - Review list of the 60 answers (correct ✓ / wrong ✕ per existing review-item pattern) — this is where exam-mode feedback is shown, after submit.
  - Buttons: `Retake exam` (ghost) + `Back to series` (primary).
- **Retakes:** unlimited — the existing `Retake quiz` resets the run and re-arms the ring animation (already implemented in QuizWidget; exam widget mirrors it).

### 3.4 Guest CTA placeholder (gating)

- **Anatomy:** same card silhouette as the quiz (`max-w-[640px]`, `rounded-[20px]`, white, `p-7`) so the page does not jump between authed/guest renders. Content:
  - A mono kicker: `Quiz · locked for guests` (red tick).
  - A small lock glyph (inline SVG, navy) — NOT an icon topper slab; a 24px glyph in a 48px ring, aligned left or centered per execution choice.
  - Copy (exact): **"Test what you learned and track your progress by creating an account and logging in!"**
  - A short benefit line in gray mono: `3 questions per lesson · knowledge checks · timed exam · certificate`.
  - Primary button `Create an account` → `/login?next=<current-path>`; secondary text link `Log in` → `/login?next=`.
- **Semantics (a11y):** the container is a `<section aria-label="Practice questions locked">`; the button is a real link. No question text in HTML at all.
- **Empty state:** this replaces the old "no questions → render nothing" behavior for guests. Authed users with a legitimately empty question file still get the existing silent-nothing behavior.

### 3.5 Exam locked state (Monitor)

- **Anatomy:** navy panel (`rounded-2xl`, navy bg, white text, subtle radial glow per existing hero-glow language) or a white card — execution picks; brief recommends the navy panel so it reads as a milestone gate, distinct from the white quiz cards.
- **Content:**
  - Mono kicker: `CERT PREP EXAM` + lock glyph.
  - Headline: **"Unlock: complete all 9 knowledge checks with 80%+"**.
  - Per-check progress list: 9 rows, each `Check N — Lessons X–Y` with right-aligned status: emerald `Passed · 92%` OR neutral `80% required`. Rows are non-interactive here (they link to the check pages on the series page — execution confirms link target; brief: keep them links so the user can go fix a failed check).
  - A summary line: `Checks passed 5/9` + a thin emerald progress bar (Monitor signal).
  - No disabled "Start exam" button — the gate is the list itself. The primary action is implicit: pass the checks.
- **Guests:** the locked state is for authed users; guests get the guest CTA (3.4).

### 3.6 Certificate (ceremonial document — NO image generation)

- **Composition:** landscape document, `max-w-[880px]`, cream paper `#FFFDF8`, navy double border frame (outer `2px` navy + inner `1px` hairline `navy/30`), generous padding (~56px).
- **Typography:** brand stack — Inter. A formal display moment: `CERTIFICATE OF COMPLETION` in navy, tight tracking (`-0.02em`), weight 800; the recipient's name in the largest display size (clamp ~1.75–2.25rem); body lines in gray-600. Mono for the metadata row (date · score) to echo the system voice.
- **Signature element:** a red seal — a CSS/SVG circle with `C8102E` ring + the Adroit "A" or checkmark glyph (inline SVG, no image file), placed bottom-right or centered below the name. This is the one craft detail that makes it feel earned.
- **Data shown:** user name · series name (`OmniStudio Developer Certification Prep`) · completion date · exam score. Per BA open question, additional fields can be added by Chris — brief defaults to these four.
- **Print CSS:** `@media print` — hide nav/footer (`@page { margin: 0 }` or a print-only class), white bg, no shadows, `print-color-adjust: exact` so the navy/red print. A `Print` button triggers `window.print()`.
- **Not-eligible state:** if the user hasn't met the rule (46 lessons + exam ≥72%), show a clear message + what remains ("Complete all 46 lessons and pass the exam with 72%+") — no certificate rendering.

### 3.7 Ordering + filter (series page, Explore)

- **Ordering contract:** lessons sorted by **lesson number ascending** (canonical per course-progression-pattern). The existing `SortToggle` is retargeted: label changes from date semantics to lesson number. Mono labels: `Lesson 1 → 46` (asc) / `Lesson 46 → 1` (desc). Keep the `published · upcoming` counter.
- **Hide completed filter:** a pill toggle next to the sort control (segmented control language from the t_7e4e4898 discovery — reuse pill radius `--radius-full`). Active state = navy pill / white text; inactive = white pill / navy border. `Hide completed` filters the lesson list client-side via `useLessonProgress`, survives hydration (QA F-1 pattern already in QuizWidget).
- **Placement:** both controls in the existing syllabus header row, right side, replacing/joining the current SortToggle. No new layout section.

---

## 4. What Stays EXACTLY the Same (do not touch)

- `QuizWidget.tsx` anatomy + states + hydration gate + a11y (radiogroup, live region, segment legend). The exam widget is a **new sibling** (`ExamWidget`), not a fork of the lesson widget's internals.
- Navy/red palette, Inter + JetBrains Mono, shadow tokens, motion tokens, hero-glow.
- `src/lib/sort.ts` logic contract (ordering changes are in `learn.ts`, not sort.ts — arch confirms).
- Content MDX / curriculum pipeline (Jimmy contract is the orchestrator's task, not design's).
- Series page gradient hero panel + LessonCard + progress rows.

## 5. Motion Notes (for steel)

- All hovers: `duration-150`/`duration-200` ease-out per existing language.
- Segment fills: `transition-colors duration-200`.
- Score ring Moment (450ms spring) — already implemented, keep for all three tiers' results.
- Exam timer warning pulse: `animate-pulse`-style opacity keyframe ONLY under 10 minutes, disabled under `prefers-reduced-motion` (existing global block covers it).
- Explanation panel reveal (`reveal-up` 220ms) — lesson quiz + knowledge check only, NEVER in exam flow.

## 6. Mood Board

Generated 2026-08-10 (FAL/FLUX via `image_generate`; pollinations requires an API key on this box — noted):

- `design/discovery/moodboards/moodboard-exam.png` — navy/red exam atmosphere (timer as signature, focused desk)
- `design/discovery/moodboards/moodboard-certificate.png` — cream/navy/gold certificate flat lay (palette + formality reference)
- `design/discovery/moodboards/moodboard-quiz.png` — clean learning UI board (option rows, segments, score ring)

These are atmosphere/direction references only — the certificate mockup itself is a designed HTML component with NO image generation (constraint).

## 7. Handoff Files

- `design/discovery/direction-brief-quiz-tiers.md` — this brief
- `design/discovery/design-tokens-quiz-tiers.css` — additive tokens for the execution task
- `design/discovery/moodboards/moodboard-exam.png` / `moodboard-certificate.png` / `moodboard-quiz.png`

Execution (t_0809d7ff) composes from this: `mockup-lesson-quiz.html`, `mockup-check.html`, `mockup-exam.html`, `mockup-guest-cta.html`, `mockup-exam-locked.html`, `mockup-certificate.html`, design-system.html additions + copy deck.

## 8. Acceptance Criteria (for zod/QA after execution + implementation)

1. Lesson quiz renders inside the lesson column, matches article measure, keeps all QuizWidget states.
2. Check page shows milestone kicker + pass-status row; passing at exactly 80% shows `Passed` (boundary).
3. Exam: sticky navy timer counts down 105:00 → 00:00; red warning under 10:00; auto-submit note visible; NO per-question feedback during the flow; results show ring + pass/fail at 72%.
4. Guest CTA shows the exact copy, real link buttons, and ZERO question text in HTML source.
5. Locked exam state lists all 9 checks with per-check pass status + "Checks passed X/9" progress; guests see CTA instead.
6. Certificate prints cleanly (no nav, cream paper, navy frame, red seal) and shows name/series/date/score; not-eligible state explains the rule.
7. Series lessons order by lesson number asc/desc via SortToggle; Hide-completed filter works and survives hydration.
