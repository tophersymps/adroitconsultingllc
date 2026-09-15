/**
 * constellation-sync.ts — Daily Planet's one-command safety net for the
 * course→constellation pool.
 *
 * On a new-course launch (after editing series.json `curriculumLessons` + adding
 * a `FIGURE_PINS` entry), run:
 *
 *     npx tsx scripts/constellation-sync.ts
 *
 * It:
 *   1. Reconciles every pin against the authorable catalog — a pin naming a
 *      nonexistent/unauthorable figure is an error, not a silent no-op.
 *   2. Confirms no two courses share a figure (no double-booking) and no course
 *      owns more than one.
 *   3. Lists the current used vs available pool, and recommends the closest
 *      free figure for each course lesson count that ISN'T already pinned
 *      (so you can see what size would fit a not-yet-chosen constellation).
 *   4. Exits non-zero on any problem, so it can gate a prebuild/CI hook.
 *
 * Deterministic and read-only: it never writes learn.ts. If learn.ts ever needs
 * regenerating after a curriculum change, run `npm run prebuild`.
 *
 * Billed as "did this move something?" — with pins live, a pinned course can no
 * longer drift to another figure; this script is the explicit check that the
 * pin *chose* a figure that exists and is unused.
 */
import { CONSTELLATION_FIGURES, figureByName } from "../src/components/Constellations/chart/figure-catalog";
import { FIGURE_PINS } from "../src/components/Constellations/chart/figure-assignment";
import {
  availableFigures,
  poolCapacity,
  recommendForLessonCount,
  usedConstellationNames,
} from "../src/components/Constellations/chart/constellation-pool";

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(`❌ ${msg}`);
};

console.log("=== Constellation pool sync ===");

// 1. Every pin must name an authorable figure.
const pins = Object.entries(FIGURE_PINS);
console.log(`\nPins (${pins.length} courses):`);
for (const [slug, name] of pins) {
  const fig = figureByName(name);
  if (!fig) {
    fail(`${slug} -> "${name}" is not an authorable figure.`);
    continue;
  }
  console.log(`  ${slug.padEnd(28)} -> ${name} (${fig.stars.length}★)`);
}

// 2. No double-booking, no multi-own.
const used = usedConstellationNames();
const seen = new Set<string>();
for (const name of used) {
  if (seen.has(name)) fail(`figure "${name}" is pinned by more than one course.`);
  seen.add(name);
}
if (pins.length !== used.size) {
  fail("duplicate pins detected (same count mismatch).");
}

// 3. Reconcile available = catalog - used.
const available = availableFigures();
const availableNames = available.map((f) => `${f.name} (${f.stars.length}★)`);
console.log(`\nAvailable figures (${available.length}/${CONSTELLATION_FIGURES.length}):`);
console.log("  " + availableNames.join(", "));

const cap = poolCapacity();
console.log(
  `\nPool capacity: ${cap.total} IAU-88 plates = ${cap.authorable} authorable (can light per lesson), ${cap.artOnly} art-only (future pool).`,
);

// 4. Recommend a fit for any *unpinned* real course count (informational).
console.log("\nRecommended fit for common lesson counts (closest AVAILABLE figure):");
for (const n of [8, 10, 15, 20, 24, 30]) {
  const rec = recommendForLessonCount(n);
  if (rec) {
    console.log(`  ${n} lessons -> ${rec.name} (${rec.stars.length}★)`);
  } else {
    console.log(`  ${n} lessons -> (no available figure)`);
  }
}

console.log(failed ? "\n🛑 Pool has errors — fix FIGURE_PINS before shipping." : "\n✅ Pool is consistent.");
if (failed) process.exit(1);