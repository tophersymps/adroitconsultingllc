# Interactive Quiz Tiers — System Architecture

**Task:** t_cf2e9661 · **Tenant:** adroit-blog · **Repo:** adroit-blog · **Author:** brainiac (web architect)

## Architecture Overview

Three quiz tiers (lesson / knowledge check / cert exam) plus a certificate, all reusing the
existing live quiz stack (QuizWidget, useQuizProgress, server-side grading, quiz_attempt /
quiz_run tables, Supabase auth). Question content is generated from the canonical curriculum
bank into per-tier JSON; the site renders those JSONs. One genuinely new build: the timed
exam mode (ExamWidget). Learn lesson ordering switches from date (ADR-002) to lesson number.

**Stack:** Next.js App Router (server components + SSG where safe), MDX, Supabase (auth +
quiz_attempt / quiz_run / lesson_completion), TypeScript, existing design tokens + kara's
mockups. No schema changes.

## Component Tree

```
src/app/learn/[series]/page.tsx            (server; lesson-number order, syllabus, tiers cards)
  └─ SeriesSyllabus (client)               ← owns sort + hide-completed
  └─ CertReadiness (client)                ← lessons/checks/exam + readiness bar (GET /tiers)
  └─ CheckCardList (client|server)         ← 9 check rows w/ pass state (GET /tiers)
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

## Data Flow

1. Generator (`scripts/generate-omni-quizzes.py`, steel) reads `~/.hermes/scripts/omni-studio-curriculum.py` → emits `content/learn/omni-studio-cert/questions/<slug>.json` (46×3q), `checks/check-<1..9>.json` (9×15q), `exam.json` (60q domain-weighted).
2. Page render: server component resolves session (getSupabaseServerClient). Authed → load tier JSON via `src/lib/quiz.ts` lookups → pass questions to client widget. Guest → render GuestCTA, never load question JSON.
3. Answer flow (lesson/check): client `useQuizProgress` → per-question POST /api/progress/quiz → server recomputes correctness from canonical JSON (F3) → upserts quiz_attempt. Run completion → POST /api/progress/quiz/run (quiz_run row, best score).
4. Exam flow: client ExamWidget accumulates answers → single POST /api/progress/quiz/batch (60 answers + elapsedSeconds) → server grades all 60 from exam.json → upserts 60 quiz_attempt rows + 1 quiz_run row → returns score + per-question results for the review screen.
5. Rollup: series page `CertReadiness` → GET /api/progress/quiz/tiers?series=… → lessons completed + per-check best (MAX score per quiz_name) + exam best + unlocked flag.
6. Certificate: `/learn/[series]/certificate` server component derives eligibility from lesson_completion + quiz_run rows at render time (no table).

## API Contracts

| Route | Method | Purpose |
|---|---|---|
| /api/progress/quiz | POST | per-question grading (lesson/check) — switch to resolveQuizByName |
| /api/progress/quiz/run | POST/GET | run stats per quizName (bestScore, attempts) |
| /api/progress/quiz/batch | POST | NEW — 60-question exam submit, server-graded, returns results |
| /api/progress/quiz/tiers | GET | NEW — tier rollup for series page (checks, exam, lessons, unlocked) |
| /api/auth/session | GET | session state for gating |

quizName scheme: `omni-studio-cert:lesson:<slug>` · `:check:<n>` · `:exam`.
New `validateQuizName` (colon-safe) + `resolveQuizByName` in lib — the existing
`validateSlug` regex rejects colons and the grading route loads by series slug, so this
resolver change is required before any tier attempt works.

## ADR Table

| ID | Title | Decision | Consequences |
|---|---|---|---|
| ADR-101 | Tier quiz-name scheme | `series:lesson:<slug>` / `:check:<n>` / `:exam` | requires validateQuizName + resolveQuizByName; no schema change |
| ADR-102 | Batch exam grading route | new POST /api/progress/quiz/batch; existing route unchanged | one request per exam; server recomputes all correctness |
| ADR-103 | Exam timer trust model | client countdown + server elapsed bound [0, 105:60+60s] | bounds tampering; not proctored — flagged for val-el |
| ADR-104 | Server-side gating | session check in server components; questions only when authed | lesson pages become dynamic-ish |
| ADR-105 | Lesson-number ordering | lessons sort by lesson number asc; SortToggle + build-learn.js synced | ADR-002 superseded for learn listings |
| ADR-106 | Certificate derived on demand | derive from lesson_completion + quiz_run at render | revalidated at print; no table |
| ADR-107 | Readiness weighting | lessons 40% / checks 30% / exam best 30% | display-only metric |

## Schema Changes

None. Reuses `quiz_attempt` (user_id, quiz_name, question_index, correct_answer_index,
user_answer_index, is_correct, attempted_at), `quiz_run` (best score per quiz_name),
`lesson_completion` (user_id, lesson_slug, completed_at). Content files are generated JSON.

## Handoff Guide for Kara (designer)

Design phase is complete (mockups + copy deck live in `design/`). Downstream consumers:
- Steel implements from `docs/implementation-plan-quiz-tiers.md` + `src/shared/contracts.ts` (contracts are read-only).
- Lara audits a11y/SEO: exam timer reduced-motion, radiogroup/focus, guest CTA semantics, no question leakage, ordering/filter a11y.
- Val-el reviews security: server-side grading, slug/elapsed validation, certificate integrity.
- Zod verifies acceptance criteria from `docs/requirements-quiz-tiers.md`; alpha deploys.

Exact copy strings: `design/copy-deck-quiz-tiers.md` — steel uses verbatim.
