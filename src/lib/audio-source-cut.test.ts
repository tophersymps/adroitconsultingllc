/**
 * audio-source-cut.test.ts — boundary detection for truncating the trailing
 * "Sources" citation block out of existing narrated audio.
 */
import { describe, it, expect } from "vitest";
import {
  computeCut,
  SOURCES_SUMMARY,
  type TimingSegment,
} from "./audio-source-cut";

function seg(text: string, startSec: number, endSec: number): TimingSegment {
  return { text, startSec, endSec };
}

// Synthetic "content then sources" audio, mirroring a real pre-fix article:
// content segments (last one ending on real prose), then source segments that
// start with the flattened `[^n]:` residue and carry a link-label domain.
const SEGS: TimingSegment[] = [
  seg("Section: The eval layer.", 0, 4),
  seg("Most teams can trace their agent, but few can measure it.", 4, 12),
  seg("So we look at the two yardsticks at once: observability and evals.", 12, 20),
  seg("' LangChain, \"Evaluating AI Agents.\" langchain.com", 20, 26),
  seg("' Maxim AI, \"Top 5 Platforms.\" maxim.ai", 26, 30),
];

const FIXED_LINES = [
  "Section: The eval layer.",
  "Most teams can trace their agent, but few can measure it.",
  "So we look at the two yardsticks at once: observability and evals.",
  SOURCES_SUMMARY, // appended by the fixed narration; NOT content
];

describe("computeCut", () => {
  it("returns the cut at the end of the last content segment, dropping the source tail", () => {
    const cut = computeCut(SEGS, FIXED_LINES);
    expect(cut).not.toBeNull();
    expect(cut!.cutIndex).toBe(2);
    expect(cut!.cutSec).toBe(20);
  });

  it("returns null when there is nothing trailing to drop (already content at the end)", () => {
    const noSources = SEGS.slice(0, 3);
    expect(computeCut(noSources, FIXED_LINES)).toBeNull();
  });

  it("returns null when a trailing segment is NOT a citation (boundary suspect)", () => {
    // last segment reads like article content -> refuse the cut
    const badTail = [
      ...SEGS.slice(0, 3),
      { text: "This is a final closing paragraph, not a citation.", startSec: 20, endSec: 26 },
    ];
    expect(computeCut(badTail, FIXED_LINES)).toBeNull();
  });

  it("returns null for empty segments / empty content", () => {
    expect(computeCut([], FIXED_LINES)).toBeNull();
    expect(computeCut(SEGS, [])).toBeNull();
  });
});