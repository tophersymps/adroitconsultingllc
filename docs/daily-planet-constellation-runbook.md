# Daily Planet — Course → Constellation Assignment Runbook

> **Who:** Daily Planet editors. **What it buys you:** launching a new course in
> the constellation system is a **two-declarative-edit + one command** chore —
> no developer, no code. The machinery (pins, pool, guards) is built and
> maintained by the engineering team; all *you* do is choose and declare.

## The rule

**Each course owns exactly one constellation, and that constellation is not used
by anything else.** A pinned constellation is *claimed* — the code refuses to let
a second course take it, and CI fails if a pin ever duplicates or disappears. So
a course's constellation never changes under you and never collides with another.

## How it's decided

Assignment is **size-based**: a course should get a figure with about as many
stars as it has final lessons, so a lesson can light a star (1:1 where possible;
big courses round-robin a few lessons per star). It is **not** thematic — the
code does not match "marketing course" to "Virgo." If you want a themed choice,
that is your editorial override: pin whatever fits.

## What to do when a NEW course is planned

### 1. Declare the final lesson count

Add `"curriculumLessons": N` to the new course's `content/learn/<slug>/series.json`,
using the **final** planned lesson count from the curriculum schedule. This sizes
the constellation and enables "coming soon" placeholders. Never use the published
count — that grows daily and would reshuffle the sky.

### 2. Pick an unused constellation

Run the pool command to see what's available and what size fits:

```bash
cd ~/Documents/Fortress-of-Solitude/adroit-blog
npm run constellation:pool
```

It prints:
- every pinned course and its figure (the "used" list),
- every **available** (unpinned, authorable) figure with its star count,
- the 88 = 30 authorable + 58 art-only breakdown,
- a recommended fit for common lesson counts (closest **available** figure).

Pick the available figure whose star count is closest to your course's
`curriculumLessons`. Big courses (>13 lessons, the largest free figure) will
round-robin a few lessons per star — that's expected and honest.

> **Note:** the 7 biggest authorable figures (14–20★) are already claimed by the
> 7 current courses. If your new course is large, it will land on the largest
> *free* figure (currently 13★ Scorpius) until more large figures are authored.
> That's a Phase 3 scale decision, not a problem with your course.

### 3. Pin it

Add one line to `FIGURE_PINS` in:

```
src/components/Constellations/chart/figure-assignment.ts
```

```ts
export const FIGURE_PINS: Readonly<Record<string, string>> = {
  // ...existing pins...
  "<new-course-slug>": "<Chosen Constellation Name>",
};
```

Use the exact display name from the pool output (e.g. `"Corona Borealis"`).

### 4. Verify (one command, non-zero on any problem)

```bash
npm run constellation:pool
```

This **is** the validation — it exits non-zero if a pin names a figure that
doesn't exist, two courses share a figure, or any course double-books. (A fuller
regeneration of `learn.ts` after a curriculum change: `npm run prebuild`.)

The repo's CI also runs the guard suite, so a bad choice fails the pull request,
never production.

### 5. Ship via the normal PR flow

`main` is branch-protected for code, so the pin + `series.json` changes travel
through a pull request the engineering team shepherds (create → CI green →
merge → deploy). Your two edits are the entire content work.

---

## Reference — the machinery

| Term | File | Purpose |
|---|---|---|
| Final lesson count | `series.json` → `curriculumLessons` | Sizes the constellation; enables placeholders |
| Assignment registry (pins) | `figure-assignment.ts` → `FIGURE_PINS` | The single source of truth: course → constellation, exclusive |
| Authorable figure catalog | `figure-catalog.ts` → `CONSTELLATION_FIGURES` | The 30 constellations with real star coords that can light per lesson |
| Used/available pool | `constellation-pool.ts` | Derived from pins + catalog; feeds the pool command |
| Pool + validation CLI | `scripts/constellation-sync.ts` | `npm run constellation:pool` — prints pool, validates pins |
| Guards | `src/lib/chart.test.ts` | CI: every real course pinned, pins unique + real, course page == profile, pool reconciles |

## The 88 cap

Every constellation assignment comes from the IAU-88. Of those, **30 are
authorable** (have star coordinates so a lesson can light a star); 58 are art-only
engravings that cannot light per lesson until figures are authored (a Phase 3
"needed sizes" decision — new figures get authored to match course demand, not
all 58 at once). When 30 authorable figures are exhausted, new courses degrade to
label-and-progress and the fix is authoring more figures, **never** double-booking
an existing one.

When all 88 are assigned someday, the team explores **new original constellations**
— a decision, not a code concern. Until then the pool tracker keeps the crossing
explicit (used grows, available shrinks).