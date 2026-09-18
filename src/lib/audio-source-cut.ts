/**
 * src/lib/audio-source-cut.ts — pure helper to find where an article's
 * narrated audio should be truncated to drop the trailing GFM "Sources"
 * citation block.
 *
 * WHY THIS EXISTS
 * A pre-fix regression in audio-narration.ts read the article's footnote
 * *definition* lines (`[^n]: <citation>`) aloud, so existing narrated MP3s
 * end with a run of segments that recite source titles + URLs. We don't want
 * to re-synthesize 90+ MP3s. Each stored `.timing.json` records `startSec` /
 * `endSec` for every spoken segment, so the audio can be cut (stream-copy)
 * at the boundary where content ends and the source block begins.
 *
 * This module finds that boundary. It is kept pure (no fs / network) so the
 * truncation tool and the Vitest suite share one implementation.
 *
 * CONTRACT
 * The source block is always TRAILING: article content never follows it. The
 * boundary is found by (1) grounding on the article's FINAL content line —
 * the last timing segment whose transcribed text contains that line's tail
 * is the last content segment — and (2) requiring every segment AFTER it to
 * look like a citation (leading footnote-marker residue `'` / `:` / `"`, a
 * bare link-label domain, or a URL). If either step can't be established
 * safely, the tool REFUSES to cut (returns null) rather than risk trimming
 * real content or leaving sources behind.
 */
export interface TimingSegment {
  text: string;
  startSec: number;
  endSec: number;
}

export interface CutResult {
  /** Index (inclusive) of the LAST content segment; everything after drops. */
  cutIndex: number;
  /** endSec of that segment — the exact mp3 truncation time. */
  cutSec: number;
}

/** The summary sentence mdxToNarration now emits in place of the source block. */
export const SOURCES_SUMMARY = "Sources are listed at the end of the article.";

/** Lowercase alphanumerics only (space-separated) for robust substring match. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Does a segment read like a citation (footnote residue / link-label domain / URL)? */
function isCitationSegment(seg: TimingSegment): boolean {
  const t = seg.text.trim();
  if (!t) return false;
  return (
    // leading stray quote / apostrophe / colon — the flattened `[^n]:` residue
    /^['":]/.test(t) ||
    // a bare link-label domain, e.g. `langchain.com` kept when [label](url) collapsed
    /\b[\w-]+\.(com|org|io|net|dev|ai|app|co|gov|edu|git|web|love|me)\b/i.test(t) ||
    // a raw URL
    /\b(https?:\/\/|www\.)\b/i.test(t)
  );
}

/**
 * Determine the truncation cut for one article.
 *
 * @param segs       stored timing segments (pre-fix, include the source block)
 * @param fixedLines FIXED narration lines (the spoken-summary sentence excluded)
 * @returns the cut, or null when no safe boundary could be established.
 */
export function computeCut(segs: TimingSegment[], fixedLines: string[]): CutResult | null {
  if (!Array.isArray(segs) || !segs.length) return null;

  // The article's real last content line. The summary sentence mdxToNarration
  // now appends is NOT content and was never spoken in pre-fix audio, so it
  // must not be used as the alignment anchor.
  const contentLines = (fixedLines || []).filter(
    (l) => l.trim() && l.trim() !== SOURCES_SUMMARY,
  );
  if (!contentLines.length) return null;
  const lastContent = norm(contentLines[contentLines.length - 1]);
  if (!lastContent) return null;

  // Anchor: a fragment of the last content line's tail, progressively shortened
  // until one of the stored segments contains it. The LAST segment containing
  // it is the final content segment (content precedes sources in the audio).
  let frag = norm(lastContent.split(/\s+/).filter(Boolean).slice(-12).join(" ")) || lastContent;
  let cutIndex = -1;
  for (let attempts = 0; attempts < 24 && cutIndex === -1; attempts++) {
    const fragNorm = norm(frag);
    if (fragNorm.length >= 6) {
      for (let i = segs.length - 1; i >= 0; i--) {
        if (norm(segs[i].text).includes(fragNorm)) {
          cutIndex = i;
          break;
        }
      }
    }
    if (cutIndex !== -1) break;
    frag = norm(frag.split(/\s+/).filter(Boolean).slice(1).join(" "));
    if (!frag) break;
  }
  if (cutIndex === -1) return null;

  // Safety: EVERY segment after the last content segment must be a citation.
  // Any non-citation segment there means the boundary is suspect — refuse the
  // cut rather than delete real content.
  for (let i = cutIndex + 1; i < segs.length; i++) {
    if (!isCitationSegment(segs[i])) return null;
  }

  // Nothing trailing to drop (last segment is already content) or a degenerate
  // cut (no sources / too-short audio).
  if (cutIndex >= segs.length - 1) return null;
  const cutSec = segs[cutIndex].endSec;
  if (!(Number.isFinite(cutSec) && cutSec > 0.5)) return null;

  return { cutIndex, cutSec };
}