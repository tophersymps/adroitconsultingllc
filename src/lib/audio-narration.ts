/**
 * src/lib/audio-narration.ts — turn article MDX into speakable narration prose.
 *
 * Phase 1 of the article-audio build (plan t_0ddd606c). Used by BOTH the
 * batch generator (scripts/build-audio.js, imported via Node) and the Vitest
 * suite. Kept pure (no fs, no React, no client imports) so it runs anywhere.
 *
 * Behaviour (per the plan + arch contract in src/lib/audio/contracts.ts):
 *   - strip the YAML frontmatter block
 *   - render `#`..`######` headings as section cues: `Section: <heading>.`
 *   - at each `![alt](<path>)` image, inject a spoken diagram description
 *     built from the markdown alt text (default `Diagram: <alt>.`), so a
 *     listener without visual access still hears what the diagram depicts.
 *     This is exactly the text the Figure component already uses as the
 *     accessible caption + aria-label (alt IS the diagram description).
 *   - collapse markdown emphasis / links / inline code to plain prose
 *   - drop footnote markers `[^n]` and the trailing `## Sources` citation
 *     list (spoken as a single summary sentence instead)
 *
 * SPDX note: an optional per-diagram override is supported. If a line
 * immediately following an image starts with `description:: `, the narration
 * reads that text instead of the bare alt — for diagrams whose alt is terse.
 */

/** Diagram-source resolver: prefer an explicit description:: override, else alt. */
export interface NarrationOverrides {
  /** Wrapper for each spoken diagram line. Default: (alt) => `Diagram: ${alt}.` */
  leadIn?: (alt: string) => string;
  /** Optional diag-resolver extension point (contract NarrationOptions). */
  diagramSource?: (src: SpokenDiagramInput) => string;
}

/** A figure's spoken-diagram source (mirrors contract SpokenDiagramSource). */
export interface SpokenDiagramInput {
  alt: string;
  /** Optional per-diagram override from a `description::` line. */
  description?: string;
}

const defaultLeadIn = (alt: string) => `Diagram: ${alt}.`;

/** Strip the `---` frontmatter block; returns the MDX body unchanged if absent. */
export function stripFrontmatter(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return raw;
  return lines.slice(end + 1).join("\n");
}

/** Collapse a single markdown line into plain spoken prose. */
function flattenLine(line: string): string {
  let s = line;
  // links: keep the label, drop the URL — `[label](url)` -> `label`
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // references/bare URLs: keep as written but de-bracket
  s = s.replace(/<([^>]+)>/g, "$1");
  // inline code spans: keep literal contents
  s = s.replace(/`([^`]+)`/g, "$1");
  // emphasis / strikethrough / blockquote / heading markers -> space
  s = s.replace(/[*_~#>|]+/g, " ");
  // footnote markers [^n]
  s = s.replace(/\[\^\d+\]/g, "");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Convert article MDX into speakable narration text.
 * Returns normalized prose (newlines preserved per line), or "" for empty input.
 */
export function mdxToNarration(
  mdx: string,
  opts: NarrationOverrides = {},
): string {
  if (!mdx || !mdx.trim()) return "";
  const leadIn = opts.leadIn ?? defaultLeadIn;

  const body = stripFrontmatter(mdx);
  // resolve a diagram's spoken text: description:: override wins, else alt
  const resolveDiagram = (src: SpokenDiagramInput) => {
    const text = src.description?.trim() ? src.description : src.alt;
    return leadIn(text);
  };

  const lines = body.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Diagram image line: ![alt](<path>)
    const img = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(trimmed);
    if (img) {
      const alt = img[1] || "";
      // consume an immediately-following `description:: ` override
      const next = lines[i + 1]?.trim() ?? "";
      let description: string | undefined;
      if (next.startsWith("description::")) {
        description = next.slice("description::".length).trim();
        i += 1; // swallow the description line
      }
      const text = resolveDiagram({ alt, description });
      if (text) out.push(text);
      continue;
    }

    // Heading: # ... -> "Section: ...."
    const heading = /^#{1,6}\s+(.+)$/.exec(trimmed);
    if (heading) {
      const text = flattenLine(heading[1]);
      if (text && !/^sources$/i.test(text)) out.push(`Section: ${text}.`);
      else if (/^sources$/i.test(text)) {
        // trailing Sources citation list — don't read URLs verbatim
        out.push("Sources are listed at the end of the article.");
      }
      continue;
    }
    if (trimmed.startsWith("description::")) continue; // stray override line

    out.push(flattenLine(trimmed));
  }

  return out.filter(Boolean).join("\n");
}