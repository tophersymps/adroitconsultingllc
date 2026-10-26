# Learn UX — lesson/check mapping module (A3)

**What:** New pure module `src/lib/lesson-checks.ts` (contract
`deliverables/learn-ux-exam-naming/api-contracts.md` §B.1) owning every
lesson ↔ knowledge-check relationship, plus `src/lib/lesson-checks.test.ts`
(68 tests):

- `buildTimeline(lessons, checks)` interleaves a check node immediately after
  the last published lesson at or below `check.lessons[1]` — the range end
  `getKnowledgeChecks()` resolved from the check file's own title. It is total
  (`lessons.length + checks.length` nodes for any input), it never mutates its
  inputs, there is no `5 * n` arithmetic anywhere in it, and checks past the
  published tail or before lesson 1 land at the end in `n` order instead of
  crashing or claiming lessons that do not exist.
- `checkEndingAt`, `checkCovering`, `nextLessonAfter`, `checkState`,
  `hiddenByFilter` implement the D-5 hide rule and the routing seams A5/A6/A7
  consume.
- `checkState` returns `"passed" | "available"` only: no `"locked"` member, no
  `mode` parameter, no gate module (architecture.md §4, ADR-304).
- A check whose `lessons` range is missing, short, non-integer, zero-based or
  backwards **throws** (`assertCheckRange`) instead of falling back to
  `5n-4, 5n` (ADR-303).

No visible surface changes (build card).

**Why:** Item 2 moves the milestone checks into the syllabus timeline so a
learner sees the milestone coming before finishing the course, and A6/A7 route
into and out of a check from the lesson page. Three consumers must agree on
where a check sits, so that arithmetic lives in one pure, unit-tested module
rather than in each component. Positioning from the resolved title range (not
`5n`) keeps it correct for the non-5 cadences already in the content:
`agentic-ai` 8-lesson ranges, `sf-omni-consultant` 12 checks, `ai-at-work`
6 checks, `ai-adoption`'s short tail at 31-34. A test pins the input
conformance at the file level: all 90 `check-*.json` titles across 12 series
match `Lessons A-B`, so `quiz.ts`'s dormant `5n` fallback cannot move a node
today, and a future file that breaks the pattern fails CI instead of silently
relocating a milestone.

**Verified:**
- `npx vitest run src/lib/lesson-checks.test.ts` — 68 passed.
- `npx vitest run src/lib/lesson-checks.test.ts src/lib/quiz.test.ts` —
  91 passed.
- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx eslint src/lib/lesson-checks.ts src/lib/lesson-checks.test.ts` — clean.

**Known issues / notes:**
- `hiddenByFilter` takes the hidden set as lesson **numbers**, not slugs. A
  check node's range is in lesson numbers, so a slug set cannot answer "is
  every lesson in this range hidden" without the lessons themselves. The
  amendment is recorded in `api-contracts.md` §B.1 in this same PR; the
  syllabus (A5) maps its completed-lesson slugs to numbers once.
- `quiz.ts`'s `5n` fallback itself is untouched (out of scope for this plan);
  this module never calls it and never re-derives a range.
- Nothing in this card renders. The node component, syllabus interleave and
  lesson-page routing are A5/A6/A7.
