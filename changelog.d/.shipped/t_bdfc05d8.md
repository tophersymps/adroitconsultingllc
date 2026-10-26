### Lesson-end milestone: route into the knowledge check (t_bdfc05d8)

**What** - Extracted the exam gate's per-check pass derivation into `src/lib/check-scores.ts`
(`loadCheckScores`, `loadCheckScore`) and used it from both `exam/page.tsx` (behaviour unchanged) and
the lesson page. A lesson that ends a knowledge check's range now routes into the check: the new
`MilestonePanel` renders between the practice questions and the sources with "Take Knowledge Check N"
as its primary action, and `LessonNavigation` gained `nextOverride` so the Next card targets
`/atlas/<series>/check/<n>` ("Knowledge Check N", kicker "Lessons A-B"). Once the check is passed,
Next and the panel continue to the following lesson instead. The verdict is the authoritative
server-graded `quiz_attempt` read, one query per lesson page, shared by panel and navigation.

**Why** - The check exists as a milestone in the syllabus but nothing on the lesson told the learner
where to go when they finish the range; US-005. Reading pass state from `quiz_run` was already ruled
out (client-writable), so the lesson page asks the same question of the same table the exam gate uses
rather than adding a third opinion.

**Verified** - `npx tsc --noEmit` clean. `npx vitest run src/lib/check-scores.test.ts
"src/app/atlas/[series]/[slug]/page.milestone.test.tsx"` 14 passed; the exam page, certificate and
lesson page suites 107 passed across 8 files; full suite green. Page tests cover: zero-progress
learner on lesson 5 gets the panel and a check Next on first paint; passed check sends Next and the
panel to lesson 6; guest issues no score query and claims no pass state; a non-range-end lesson gets
neither.

**Known Issues** - Guests see the panel in its not-passed state (no pass state is claimed and no
query is made), so the primary action leads to the check route, which is paywalled for them. The
panel's passed-but-no-next-lesson case (a check ending on the series' last lesson) offers "Review
Knowledge Check N" because the contract does not define a destination there. No lesson gating of any
kind was added: the lesson body and the following lesson render whether or not the check is passed.
