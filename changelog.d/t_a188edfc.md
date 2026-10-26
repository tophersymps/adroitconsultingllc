### Continue to the next lesson after passing a knowledge check (t_a188edfc)

**What** - `QuizWidget` accepts two additive props, `continueHref` and `continueLabel`, per
`deliverables/learn-ux-exam-naming/api-contracts.md` section B.5. When the run passed, a pass
threshold is set and a `continueHref` is supplied, the results view renders that link as the
primary action (filled navy, full width, `data-primary-action="continue"`) and demotes Retake to
the secondary outline treatment. Retake stays primary on a fail, and every caller that passes
neither prop (all lesson tier quizzes) renders exactly what it rendered before. The check page now
computes the target with the pure `nextLessonAfter` helper against the series' lesson list, using
the check's own range end as the anchor, and passes `/atlas/<series>/<next.slug>` with the label
`Continue to Lesson <n>`. A check whose range ends at the published tail has no following lesson,
so it passes neither prop and keeps Retake primary. The widget adds no pass logic of its own: it
reuses the `passed` computation that already drives the verdict pill.

**Why** - A learner who passed Knowledge Check 1 (lessons 1 to 5) landed back on the series page
and had to find lesson 6 themselves. The milestone is passed, so the useful next step is the next
lesson, and the results card is the surface where that decision is made.

**Verified** - `npx vitest run src/components/Progress/QuizWidget.test.tsx "src/app/atlas/[series]/check/[n]/page.test.tsx"`
26 tests pass, including the new pass case (Continue link with the right href, `bg-navy`, Retake no
longer `bg-navy`), the fail case (no Continue link, Retake primary) and the no-props case (lesson
quiz unchanged), plus two check page tests (the widget receives the lesson after the range end, and
receives no target when the range ends at the tail). `npx tsc --noEmit` clean.

**Known Issues** - None.
