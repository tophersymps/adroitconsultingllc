/**
 * audio-scroll.test.ts — Tier C exact paragraph scroll-sync pure logic.
 *
 * Covers the mapping util that turns a SegmentTiming[] manifest + the article's
 * content blocks into a scroll action: which segment is active at currentTime,
 * which article block that segment maps to, and the window.scrollTo target so
 * the block's top sits just below the floated player.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeText,
  alignSegmentsToBlocks,
  activeSegmentIndex,
  targetScrollYForBlock,
  type SegmentTiming,
} from "./audio-scroll";

const T: SegmentTiming[] = [
  { text: "Section: Introduction.", startSec: 0.0, endSec: 3.0 },
  { text: "The architecture evolved significantly.", startSec: 3.0, endSec: 6.0 },
  { text: "This is the second paragraph.", startSec: 6.0, endSec: 9.0 },
];

const BLOCKS = [
  "Introduction", // h2
  "The architecture evolved significantly.", // p1
  "This is the second paragraph.", // p2
];

describe("normalizeText", () => {
  it("lowercases, strips punctuation/markup and collapses whitespace", () => {
    expect(normalizeText("  The *Architecture* evolved!!  ")).toBe(
      "the architecture evolved",
    );
  });
});

describe("activeSegmentIndex", () => {
  it("returns the segment whose [startSec,endSec] contains currentTime", () => {
    expect(activeSegmentIndex(T, 4.0)).toBe(1);
    expect(activeSegmentIndex(T, 0.0)).toBe(0);
  });

  it("clamps: before start -> 0, at/past end -> last, empty -> -1", () => {
    expect(activeSegmentIndex(T, -1)).toBe(0);
    expect(activeSegmentIndex(T, 9.0)).toBe(2);
    expect(activeSegmentIndex(T, 99)).toBe(2);
    expect(activeSegmentIndex([], 5)).toBe(-1);
  });
});

describe("alignSegmentsToBlocks", () => {
  it("aligns each segment to the article block whose text it matches, in order", () => {
    const map = alignSegmentsToBlocks(T, BLOCKS);
    // all three segments resolve to a block; order-preserving (non-decreasing)
    expect(map).toHaveLength(T.length);
    const blockIdxs = map.map((b) => b?.blockIndex ?? -1);
    expect(blockIdxs).toEqual([0, 1, 2]);
  });

  it("lets consecutive segments map to the same block (a paragraph spanning chords)", () => {
    const segs: SegmentTiming[] = [
      { text: "Paragraph one, first sentence.", startSec: 0, endSec: 2 },
      { text: "Paragraph one, second sentence.", startSec: 2, endSec: 4 },
      { text: "Paragraph two.", startSec: 4, endSec: 6 },
    ];
    const mk = ["Paragraph one", "Paragraph two"];
    const map = alignSegmentsToBlocks(segs, mk);
    expect(map.map((b) => b?.blockIndex)).toEqual([0, 0, 1]);
  });

  it("falls back to the nearest prior/first block for an unmatched segment", () => {
    const segs: SegmentTiming[] = [
      { text: "Something completely different.", startSec: 0, endSec: 2 },
      { text: "The architecture evolved significantly.", startSec: 2, endSec: 4 },
    ];
    const map = alignSegmentsToBlocks(segs, BLOCKS);
    // unmatched first segment -> block 0 (nearest/first); the second segment
    // matches BLOCKS[1] and is order-preserved.
    expect(map[0]).not.toBeNull();
    expect(map[0]!.blockIndex).toBe(0);
    expect(map[1]!.blockIndex).toBe(1);
  });
});

describe("targetScrollYForBlock", () => {
  it("scrolls so the block top sits just below the floated player", () => {
    // player bottom sits at headerHeight + playerHeight (+ padding). The page
    // is scrolled to (blockTop - playerBottom), aligning the block under it.
    expect(targetScrollYForBlock(300, 120, 64, 12)).toBe(300 - (120 + 64 + 12));
    expect(targetScrollYForBlock(64, 120, 64, 12)).toBeGreaterThanOrEqual(0);
  });
});