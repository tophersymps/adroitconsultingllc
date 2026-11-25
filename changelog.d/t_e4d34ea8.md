### Remove the retired SeriesStarChart and correct the doc comments that claimed it was mounted (t_e4d34ea8)

**What** - Deleted `src/components/Constellations/chart/SeriesStarChart.tsx`, which nothing imported, and
removed the orphan `vi.mock` for it in `src/app/atlas/[series]/page.degraded.test.tsx`. Corrected the module
doc comments in `figure-pins.server.ts` and `figure-assignment.ts` so they name only the surfaces that draw
a chart in the browser today (`/profile` via `FullSkySection`, and the env-gated Hubble Field lab at
`/lab/hubble-field`), plus two further sentences in `figure-assignment.ts` that implied the course page
still resolves a constellation figure.

**Why** - Commit d772b3b6 (t_f4b8291a, 2026-11-03) replaced the course chart on `/atlas/[series]` with
`SeriesSyllabus` + `SyllabusProgressRail`, but left the component and its doc claims behind. Those claims
are not cosmetic: a release PR overstated the blast radius of the constellation figure pins because the docs
said `/atlas/[series]` draws the chart when nothing does.

**Verified** - `npx vitest run src/lib/chart.test.ts src/lib/atlas-launch.test.ts
"src/app/atlas/[series]/page.degraded.test.tsx"` passes, including the pins registry assertion that
`FIGURE_PINS` keys deep-equal `PUBLICLY_LAUNCHED_SERIES`. `grep -rn "SeriesStarChart" src/` returns nothing.
`npm run lint` and `npm run build` pass.

**Known Issues** - `constellation-pool.ts`, `figure-assignment.ts` and `figure-pins.server.ts` still say the
published projection is "four"/"eleven" series while `PUBLICLY_LAUNCHED_SERIES` now holds twelve. That stale
count predates this ticket and is left untouched. `SeriesTronRoadmap.tsx` (and its test) is now orphaned too:
`SeriesStarChart` was its only production importer.
