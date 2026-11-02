### CI: unblock main, content-growth assertions were frozen (ci-green-fix-2026-11-02)

**What** - Two tests asserted frozen values that content growth invalidated, leaving `main` red and the required `lint-test-build` check failing on every push (no code PR could merge). Fixed both at the cause:

- `src/lib/lesson-checks.test.ts` asserted `toHaveLength(90)` for the knowledge-check files. There are now 93 across the 12 series (legitimate growth as lessons published). Replaced the frozen total with the invariants that actually matter: every series in `CHECK_SERIES` carries at least one check file, and no series repeats a check index.
- `src/app/api/search/route.test.ts` asserts the ADR-220 raw payload budget of 200 KB. The index is now 436 documents (176 posts, 4 series, 256 lessons) and measured 208,602 bytes raw. Kept the ADR budget intact and reduced the payload instead: `SNIPPET_LIMIT` 120 to 96 in `src/lib/search-docs.ts`, and `terms` is now deduped (tags repeat across documents).

**Why** - `main` has been red since 2026-10-29 18:13. Content publishes land on `main` through the content-bot bypass, which does not gate on CI, so the failures accumulated silently while every code PR sat blocked on the required check. A frozen document count and a raw-size budget on a monotonically growing index are both guaranteed to break: the assertion, not the content, was the defect.

**Verified** - Full `npx vitest run` passes (184 files, 1805 tests), including the two previously-red files. `npx eslint` on both changed files and `npx tsc --noEmit` are clean. Payload re-measured at 197,183 bytes raw (inside the 200 KB ADR budget, from 208,602 before). `npm run build` runs in CI on this PR; it cannot run in the local worktree because turbopack rejects a symlinked `node_modules`.

**Known Issues** - The raw-size budget remains fragile as the index grows: each content cycle shrinks the headroom. Recommend an ADR-220 follow-up to assert the gzipped wire size (the actual cost) or to cap the index, rather than repeatedly trimming snippets. Not done here because it changes a documented contract.
