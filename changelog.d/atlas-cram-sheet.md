### Free exam cram sheet at /atlas/[series]/cram (atlas-cram-sheet)

**What** - adds `/atlas/[series]/cram`, a public revision page for a certification course. It renders
the exam headline numbers (questions, minutes, pass mark, release) from `exam-config.ts`, a table of the
blueprint domains with their weight and real question draw, then every official objective grouped by
domain, each with the deciding rule(s) taught for it and its headline trap in a warning callout. Data
lives in `src/data/cram/<series>.ts` behind a small registry, `src/lib/cram-sheets.ts`; a series absent
from that registry 404s, so the route only exists where a sheet has been authored. The course page links
it, outside the tier gate.

**Why** - the request was for "all the content needed to pass, but fun to take". A 61-lesson course is
the right shape for learning and the wrong shape for the night before the exam, where what a candidate
wants is every objective on one page with the one fact that decides it. Deliberately FREE and PUBLIC
rather than gated like `/exam` and `/certificate`: a 26-line objective-to-rule sheet does not cannibalise
a 61-lesson course, and it is the surface that earns links from study groups. The one gate kept is
EXISTENCE, via the same ADR-201 / R2-5 seam the sibling routes use (a `not-launched` series 404s, and a
token-route outage fails closed on existence unless the series is in the static mirror, CWE-200). Paywalled
is the one verdict that does not change the render, because the sheet is free.

**Verified** - full suite on this branch: 208 test files, 2041 tests, all passing; lint clean. Rendered
against a local dev server as a guest: `/atlas/sf-agentforce-specialist/cram` returns 200 with 26 objective
headings, the domain table, the trap callouts and `robots: index, follow`; `/atlas/agentic-ai/cram` and
`/atlas/no-such-course/cram` both 404, and the course page shows the link for the sheeted series and not
for `agentic-ai`. The 7 new tests assert the arithmetic (domain weights total 100, question draws total the
question count), that every objective belongs to a declared domain with a unique id and at least one rule,
and that no string carries a non-ASCII character or a banned dash or smart quote.

**Known Issues** - the sheet is generated from the course curriculum module, so a curriculum change leaves
it stale until regenerated. The exam guide phrases the question count as "60 multiple-choice questions and
up to five unscored questions" and never says "60 scored", so the sheet deliberately labels the tile
"Questions" and states the unscored count separately, which is faithful under either reading; edition 1 of
lesson 1 asserts "60 scored", which is a stronger claim than the guide makes and should be aligned to the
guide's wording in a separate content fix.
