### Publish the Agentforce Specialist course to the launch mirror (atlas-launch-agentforce-specialist)

**What** - `sf-agentforce-specialist` joins `PUBLICLY_LAUNCHED_SERIES`; the pin registry (`FIGURE_PINS_ALL`)
takes the course with the constellation **Aquila**; and the client publication projection (`FIGURE_PINS`)
follows in the same commit, because `chart.test.ts` asserts it deep-equals `publicPins()`. Two test lists
that enumerate the launched set move with it: the admin-launched series in `atlas-launch.test.ts`, and the
pinned-sky figure list plus the registry size in `chart.test.ts`.

**Why** - the course row is live in `courses` (verified: `/atlas/sf-agentforce-specialist` serves 200 with a
`Live` badge, its lessons resolve, and the search index lists it), but the static mirror was never updated
when it launched, so the published projection did not know about it. Measured before this change:
`sitemap.xml` carried zero specialist URLs while the launched sibling carries 51, and the course's own
`/exam`, `/certificate` and `/preview` documents rendered `noindex: true`, because that head is composed
from the mirror. The mirror is also the fail-closed fallback every public surface degrades to, so without
the entry a DB or token failure 404s a live course instead of serving its outline.

Aquila is the pool's own recommendation, not a hand-pick: `recommendForLessonCount(61)` over
`availableFigures()`. At 61 lessons the course is far larger than any unclaimed figure (the largest authored
is Eridanus at 20 stars, and it is taken), so the rule selects the closest available by star count, which
Aquila, Perseus and Pegasus tie for; catalogue order breaks the tie toward Aquila. One word to change.

**Verified** - full suite on this branch: 207 test files, 2021 tests, all passing. The suite went red first
(`chart.test.ts` registry size and the launched-sky figure list), which is how the two enumerated lists were
caught rather than shipped. `PUBLICLY_LAUNCHED_SERIES` is asserted equal to the seed migration's live rows
plus the admin launches, so this entry is pinned by a test rather than by a hand-tally.

**Known Issues** - nothing is live until this merges and the deploy completes: the sitemap is generated at
build time, so the specialist URLs appear only after that deploy. The `/atlas` hub is a force-static ISR
page (`revalidate = 3600`) and was already refreshing on its own schedule; it needed no change here.
