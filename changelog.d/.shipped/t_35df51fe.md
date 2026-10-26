### Learn UX — exam naming matrix + no-hardcoded-label guard (B6)

**What:** Workstream B integration. Two guards now cover the whole lane:

- `src/components/Progress/exam-label-matrix.test.tsx` — one matrix over the
  generated `learnSeries` dataset (all 12 series) that renders every surface
  which can name the exam — `ExamCard`, `CheckCardList`, `ExamLocked`,
  `ExamWidget`, `GuestCTA` (exam / check / certificate tiers), `Certificate`,
  the exam-page `<head>` (`examLabels(kind).seoTitle/seoDescription`) and
  `chronicleLabel` — and asserts each one renders its own kind's label and
  never the other kind's, in any of the three spellings (`full` / `short` /
  `phrase`). 98 tests.
- `src/lib/no-hardcoded-exam-labels.test.ts` — a source sweep of
  `src/components/Progress/**`, `src/app/atlas/**`, `src/lib/sky.ts` and
  `src/lib/sky-server.ts` (comments stripped, tests and the label source
  allow-listed) that fails if any of the six label strings appears as a literal.

Two surviving literals the sweep caught and this card fixed:
`CheckCardList` (series page, every tiered course) said "unlock the **cert prep
exam**" and the certificate page's eligibility checklist said "**Cert prep
exam** passed (≥ 72%)" — both now read from `examLabels(kind)` and
`exam-config.ts`.

**Why:** B1–B5 each fixed one slice; nothing proved the seam. A Tracks course
could still have shown certification-prep wording on a surface that forgot to
plumb `kind` — exactly the US-009 bug — and the next edit could have re-typed
the phrase into a component. The matrix fails per-surface *and* per-series, so a
regression names the guilty surface; the grep test fails on the raw literal
regardless of which surface.

**Known issues / notes:**
- Numbers, not labels, still literal in the certificate page's copy
  (`72%` on the head/body lines, `72%+` in the checklist headline). Not this
  card's scope — `CERT_EXAM_PASS_PCT` / `CERT_CHECK_PASS_PCT` are in
  `src/lib/exam-config.ts` whenever that copy is next touched.
- The grep test strips comments before matching on purpose: doc comments
  legitimately quote the old wording while explaining the fix.
- Branch is stacked on B3 (which is stacked on B5 → B2) and merges B4 in, since
  `exam-labels.ts`/`ExamKind` and B4's certificate/sky/SEO work are not on
  `main` yet. Retarget to `main` once #411–#415 land.
