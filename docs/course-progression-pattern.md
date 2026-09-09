# Course Progression Pattern — Learn Tab (canonical spec)

> **Status:** Live spec, 2026-08-10 (Chris-approved). Every Learn-series course in the
> Adroit blog follows this progression model. The OmniStudio Developer Certification course
> is the first implementation; Salesforce-Architect and Agentic-AI tracks adopt it as they
> grow question content.

## The model

Every course series ships **three quiz tiers** plus a **certificate**, in a strict
progression:

```
Lessons (with per-lesson quiz)  →  Knowledge Checks (every 5 lessons)  →  Cert Prep Exam  →  Certificate
        3 questions each                 15 questions (3×5)             60 questions,          all 46 lessons
        gated: login                      pass threshold: >80%           timed 105 min,        + exam ≥72%
                                                                         pass: ≥72%,
                                                                         locked until all
                                                                         checks pass >80%
```

## Tier definitions

| Tier | Where | Size | quizName | Pass rule |
|---|---|---|---|---|
| **Lesson quiz** | On each lesson page (Practice Questions section) | 3 questions from that lesson's requirement | `omni-studio-cert:lesson:<slug>` (series-prefixed) | None — practice, immediate feedback |
| **Knowledge check** | `/learn/<series>/check/<n>` | 15 questions pooled from lessons 5n−4..5n (3×5) | `omni-studio-cert:check:<n>` | **Best score ≥ 80%** (at least 80 — 80 flat passes) |
| **Cert prep exam** | `/learn/<series>/exam` | 60 questions, domain-weighted to the real blueprint | `omni-studio-cert:exam` | **≥72%** (real cert threshold), timed 105 min, auto-submit at zero |
| **Certificate** | `/learn/<series>/certificate` | printable | n/a | All lessons complete + exam ≥72% |

- **Checks per course:** `floor(totalLessons / 5)` — OmniStudio has 46 lessons → 9 checks
  (after lessons 5, 10, … 45). The final remainder lessons (46) feed the exam only.
- **Lesson numbering** (not publish date) is the canonical ordering for ALL lesson listings.
- **Exam unlock:** the exam is **locked until every knowledge check passes ≥80%** (at least 80 — 80 flat counts). The exam
  card shows lock state + per-check progress. This is the standard unlock rule — replace
  with per-check unlock (check N unlocks after lesson 5N) only for a paid tier, never by default.

## Auth gating (non-negotiable)

- **Quizzes are hidden entirely for guests.** No question text reaches the HTML for
  logged-out users.
- Lesson pages: guests see a sign-up CTA placeholder ("Test what you learned and track your
  progress by creating an account and logging in!"); authed users see the interactive quiz.
- Knowledge check + exam pages: same — guest CTA, authed content.
- All grading is **server-side** (client answers are hints only; correctness recomputed from
  the canonical question JSON).

## Tracking (no schema changes — reuse the quiz stack)

- `quiz_attempt` table: `user_id, quiz_name, question_index, correct_answer_index,
  user_answer_index, is_correct, attempted_at`, per-user RLS. Arbitrary `quiz_name` strings
  are supported — tier = `omni-studio-cert:<tier>:<id>`.
- Best score per quiz = MAX over the user's completed runs (derived; no new table).
- Progress rollup on the series page: lessons X/46 · checks X/9 · exam best % ·
  Certification readiness bar (lessons 40% / checks 30% / exam best 30%).

## Content pipeline (Jimmy + generator)

- **Canonical question bank:** the curriculum script (e.g. `~/.hermes/scripts/
  omni-studio-curriculum.py`) is the single source of truth — requirements, deep-dive
  content, traps, and question tuples `(qtext, options, answer_letter, explanation)`.
- **Generator** (`scripts/generate-omni-quizzes.py` pattern) emits, from the bank:
  - `content/learn/<series>/questions/<slug>.json` — per-lesson (one per lesson)
  - `content/learn/<series>/checks/check-<n>.json` — one per knowledge check (15 q)
  - `content/learn/<series>/exam.json` — 60 questions, domain-weighted
- **Jimmy does NOT write prose questions into lesson MDX.** Lesson MDX carries the
  deep-dive content only; the site renders the interactive quiz from the sidecar JSON.
  Jimmy's daily HTML study card (DM) keeps its questions — that is personal content, not
  gated blog content.
- **New series adoption checklist** (when adding a course):
  1. Curriculum script with question tuples per requirement (≥3 each).
  2. Generator emits the three JSON tiers.
  3. `seriesShortLabel` entry + series.json group.
  4. Jimmy/lesson cron prompt: no prose questions in lesson MDX.
  5. Verify: checks count = floor(lessons/5), exam ≥ 60 q domain-weighted, guest pages
     leak no question text.

## Verification (per course)

- Generator: per-lesson files = lesson count, checks = floor/5 with 15 q each, exam.json
  within ±1 of blueprint weights.
- Guest (incognito): CTA placeholder, zero question text in HTML source.
- Authed: lesson quiz records `quiz_attempt` rows; check at ≥80 marks passed, exactly 80
  passes too; all checks passed unlocks the exam; exam timed, auto-submits at zero, ≥72%
  passes; retakes record new attempts + best-score max.
- Certificate: 46 lessons + exam ≥72% → printable certificate; otherwise denied.
- Deployed: `/learn/<series>/exam`, `/learn/<series>/check/<n>`, lesson pages 200; legacy
  series-root quiz route 404s.

## History / decisions

- 2026-08-10: Chris approved this as the standard model for all course items. Key decisions:
  fold the legacy 5-question series quiz into the exam (no warm-up tier); exam unlocks on
  all checks ≥80%; unlimited retakes; hide-all-for-guests; lesson ordering by lesson number.
- Post-v1 backlog (not this build): user profile page + badges; per-check unlock gating as a
  paid-tier option.
