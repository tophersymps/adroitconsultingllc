## Learn — exam.json titles now follow each series' exam kind

**What.** All 8 `course-completion` series (`ai-at-work`, `ai-adoption`, `ai-power-user`,
`hermes-consultant`, `hermes-consultant-intermediate`, `hermes-consultant-advanced`, `agentic-ai`,
`salesforce-architect`) now title their exam `<series name>: Course Completion Exam` instead of
`<old short name>: Practice Exam`. The 4 `certification-prep` series keep their titles
character-for-character. Exam questions and descriptions are untouched. New
`src/lib/exam-titles.test.ts` pins every title to its series' `examKind` through
`src/lib/exam-labels.ts` and fails when a title carries the other kind's wording.

**Why.** `exam.json.title` is what the exam page composes into the browser tab
(`<title> | Adroit Learn`), so a Tracks course was advertising a "Practice Exam" while every other
surface called it a course completion exam (US-009/US-010). The drift test stops a future series —
or a flipped `examKind` — from shipping mismatched wording.

**Known issues.** The exam page's visible `<h1>`/kicker and its `description` fallback are still
hardcoded cert-prep copy; those are B3 and B4. `agentic-ai` is seeded `course-completion` per Chris
(waves.md §3.0), so its title follows the track shape.
