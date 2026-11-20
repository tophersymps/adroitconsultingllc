### Atlas disclosure: the DB becomes the disclosure authority (t_47183b5b)

**What** - `PUBLICLY_LAUNCHED_SERIES` (`src/lib/atlas-launch.ts`) is widened from 4 to 11 slugs and
demoted to a fail-closed outage fallback. `mayDiscloseSeries(slug, guestVisible)` no longer
intersects the healthy path with that static list: when the `courses` read succeeds, the DB verdict
decides. `isSeriesDbLive` is renamed `isSeriesGuestVisible` (`src/lib/atlas-disclosure.ts`) and now
folds the row through the single stealth rule `isGuestVisibleCourse`; `learn-visibility.ts` drops the
mirror intersection and the mirror-drift warning entirely. The client chart map `FIGURE_PINS`
(`figure-assignment.ts`) publishes the same 11 slugs.

**Why** - 7 courses launched through `/admin` since 2026-10-23 were live, priced and reachable by
direct URL, yet excluded from `sitemap.xml`, `/api/search` and their own indexable heads, because a
hand-maintained allowlist cannot track a runtime-writable table. The class is structural: the
disclosure path intersected the DB-derived guest-visible set with a 4-slug constant, so every future
launch re-created the drift. Access is deliberately unchanged: `src/lib/access.ts` imports nothing
from the disclosure modules, and the change is disclosure-only.

**Verified** - `npx vitest run` green (197 files, 1905 tests), including the new
`src/lib/atlas-access-invariant.test.ts` (invariant `DISCLOSURE_NEVER_GRANTS_ACCESS`: G1 asserts the
access module imports no disclosure module, G2 asserts a priced course is `paywall` identically for a
guest and a grant-less user, a stealth course `not-launched` for both). `npx tsc --noEmit` clean.
`npm run build` exits 0 and the build log contains zero drift warnings (the warning code is gone).

**Known Issues** - The post to Learn funnel (`src/lib/funnel.ts`) deliberately keeps the static
snapshot gate; reading the DB there would make the resolver async and opt 155 prerendered post pages
into dynamic rendering. `src/lib/learn-public.ts` is still dead code (zero runtime consumers) and is
left in place for a separate cleanup card. A residual, pre-existing and fail-closed: a course
launched after the last snapshot 404s for the duration of a credential outage.
