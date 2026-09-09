/**
 * page.overflow.test.ts — regression lock for the series syllabus horizontal
 * overflow (a11y finding t_335bc9da / t_eb265a41, WCAG 1.4.10).
 *
 * The fix lives on a server component (`src/app/learn/[series]/page.tsx`) that
 * fetches data and cannot be rendered in jsdom, so this is a **tailwind-lock**
 * test: it reads the real source and asserts the wrapper around `SeriesSyllabus`
 * uses a shrinkable grid track.
 *
 * Why this class matters: a single-column CSS grid auto-sizes its track to the
 * *max-content* of its widest item (default `min-width:auto`). The syllabus
 * toolbar (`flex flex-wrap ... justify-between` in SeriesSyllabus.tsx) measures
 * ~734px max-content even though it wraps, so the plain `grid gap-10` wrapper
 * pinned every lesson row to 734px and `/learn/omni-studio-cert` scrolled
 * ~368px sideways on a 390px phone. `grid-cols-[minmax(0,1fr)]` makes the track
 * fr-shrinkable to the container width (zero horizontal scroll), while the
 * outer `max-w-[1120px]` container still caps the layout on desktop.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = path.join(
  process.cwd(),
  "src",
  "app",
  "learn",
  "[series]",
  "page.tsx",
);

function pageSource(): string {
  return fs.readFileSync(PAGE_PATH, "utf-8");
}

/** The `<div className="grid ...">` wrapper that directly contains SeriesSyllabus. */
function syllabusGridWrapper(source: string): string {
  const idx = source.indexOf("<SeriesSyllabus");
  expect(idx, "SeriesSyllabus must be rendered on the series page").toBeGreaterThan(-1);
  // Walk back to the nearest grid wrapper div that opens before SeriesSyllabus.
  const wrapperStart = source.lastIndexOf('<div className="grid', idx);
  expect(
    wrapperStart,
    "SeriesSyllabus must be wrapped in a grid div",
  ).toBeGreaterThan(-1);
  // The opening tag ends at the first '>'.
  const tagEnd = source.indexOf(">", wrapperStart);
  return source.slice(wrapperStart, tagEnd);
}

describe("series syllabus horizontal overflow (t_335bc9da)", () => {
  it("wraps SeriesSyllabus in a grid track that can shrink below max-content", () => {
    const wrapper = syllabusGridWrapper(pageSource());
    // minmax(0,1fr) makes the single track fr-shrinkable instead of pinning to
    // the toolbar's ~734px max-content — the root cause of the 390px overflow.
    expect(wrapper).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("keeps the desktop cap on the outer syllabus container", () => {
    const source = pageSource();
    const outer = source.slice(
      source.lastIndexOf('<div className="max-w-[1120px]', source.indexOf("<SeriesSyllabus")),
      source.indexOf("<SeriesSyllabus"),
    );
    // Desktop must not regress: the content column still caps at 1120px.
    expect(outer).toContain("max-w-[1120px]");
  });
});