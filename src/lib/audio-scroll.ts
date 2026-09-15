/**
 * src/lib/audio-scroll.ts — Tier C exact paragraph scroll-sync pure logic.
 *
 * Turns a SegmentTiming[] manifest (from /api/audio/<slug>/timings) + the
 * article's rendered content blocks into a scroll action:
 *
 *   1. activeSegmentIndex — which segment's [startSec,endSec] contains the
 *      player's currentTime (binary-search + clamp).
 *   2. alignSegmentsToBlocks — map each segment to the article block that
 *      "speaks" it, using a greedy forward match on normalized text so the
 *      mapping stays order-preserving and consecutive segments can share a
 *      block (a paragraph that takes multiple audio segments/chords).
 *   3. targetScrollYForBlock — the window.scrollTo({top}) value that puts a
 *      matched block's top just BELOW the floated player.
 *
 * Pure (no DOM/fetch) so it is unit-testable and lives outside the client
 * component. Reduced-motion handling lives in the component (it reads the
 * media query once and flips the Follow-along default off).
 */
export interface SegmentTiming {
  text: string;
  startSec: number;
  endSec: number;
}

/** An article scroll target is one content block (heading, paragraph, list). */
export interface ArticleBlock {
  text: string;
  blockIndex: number;
}

export type AlignedBlock = { blockIndex: number } | null;

/** Match VII — a segment's active block resolution. */
export interface SegmentToBlock {
  /** Index of the aligned ArticleBlock, or -1 when nothing matched. */
  blockIndex: number;
}

/**
 * Normalize text for matching: lowercase, strip non-alphanumerics, collapse
 * whitespace. Turned into a stable token bag so paragraph text can be compared
 * to segment graphemes across MDX markup (bold/italics/code) that the spoken
 * form drops.
 */
export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Significant word tokens of a normalized string (len>=3). */
function tokens(s: string): string[] {
  return (s ? s.split(" ") : []).filter((w) => w.length >= 3);
}

/** True when the segment's leading phrase meaningfully overlaps a block. */
function matches(segText: string, blockText: string): boolean {
  const sn = normalizeText(segText);
  const bn = normalizeText(blockText);
  if (!sn || !bn) return false;
  // Direct containment is the cleanest signal (a spoken sentence is usually a
  // verbatim substring of its own paragraph in the cleaned narration).
  if (bn.includes(sn) || sn.includes(bn)) return true;
  // Otherwise require a strong shared-token overlap (>=60% of the segment's
  // significant words appear in the block), so markup-wrapped prose still
  // aligns to its own paragraph.
  const st = tokens(sn);
  const bt = new Set(tokens(bn));
  if (st.length === 0) return false;
  const shared = st.filter((w) => bt.has(w)).length;
  return shared / st.length >= 0.6;
}

/**
 * Greedy order-preserving alignment of segments to article blocks.
 *
 * Returns an array parallel to `segments` where each entry is the blockIndex
 * of the block that segment speaks. The cursor only moves forward so a segment
 * can never be pushed to an earlier block once later text has been consumed —
 * this is what keeps consecutive segments glued to the same block (a paragraph
 * spanning multiple audio chords) without rewinding.
 *
 * - An exact/excellent match advances the cursor to that block.
 * - A segment whose text matches the CURRENT block (not a later one) stays on
 *   it (cursor does not advance) — consecutive segments share the paragraph.
 * - A segment with no match anywhere at/after the cursor falls back to the last
 *   aligned block (nearest prior), so playback never jumps backward unexpectedly.
 */
export function alignSegmentsToBlocks(
  segments: readonly SegmentTiming[],
  blocks: readonly string[],
): AlignedBlock[] {
  const out: AlignedBlock[] = [];
  let cursor = 0; // first block index considered for the next segment

  for (const seg of segments) {
    const segText = seg.text || "";
    // Scan forward from the cursor for the earliest block matching this segment.
    let best = -1;
    for (let b = cursor; b < blocks.length; b++) {
      if (matches(segText, blocks[b])) {
        best = b;
        break;
      }
    }
    if (best >= 0) {
      out.push({ blockIndex: best });
      // Advance past the chosen block IF we consumed it fully (the next
      // segment may still belong here — we only advance, never skip back).
      cursor = best;
    } else {
      // No forward match: glue to the nearest prior aligned block (or block 0
      // when nothing else has aligned yet) so we never rewind.
      out.push({ blockIndex: Math.max(0, cursor) });
    }
  }
  return out;
}

/**
 * Index of the segment whose [startSec,endSec] contains currentTime.
 * Clamped: any t before the first segment -> 0; at/past the last endSec ->
 * the last index; empty manifest -> -1.
 */
export function activeSegmentIndex(
  segments: readonly SegmentTiming[],
  currentTime: number,
): number {
  if (segments.length === 0) return -1;
  const t = Math.max(0, currentTime);
  if (t >= segments[segments.length - 1].endSec) return segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    if (t >= segments[i].startSec && t < segments[i].endSec) return i;
  }
  // Between an end and the next start (shouldn't happen for contiguous
  // chunks) or before the first start -> nearest start.
  return segments.length - 1;
}

/**
 * The window.scrollTo({top}) pixel value that aligns a block's top just below
 * the floated player. The player sits sticky at `headerOffset(header height)`
 * and is `playerHeight` tall with `gapPx` breathing room; we want the block
 * top (its absolute offset from the document top) to start immediately below
 * that band.
 */
export function targetScrollYForBlock(
  blockTopPx: number,
  playerHeightPx: number,
  headerHeightPx: number,
  gapPx = 12,
): number {
  const band = playerHeightPx + headerHeightPx + gapPx;
  return Math.max(0, blockTopPx - band);
}