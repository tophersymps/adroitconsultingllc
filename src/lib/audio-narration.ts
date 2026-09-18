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

/**
 * Strip a single trailing sentence-ending punctuation (`.`, `!`, `?`) from a
 * diagram's resolved text before the lead-in wraps it. Real lesson diagram
 * alts already end in a period, so without this the default lead-in's own `.`
 * produces a double stop (`...or products..`) that a TTS engine reads as two
 * pauses. Only the LAST punctuation char is removed — the lead-in supplies the
 * sentence-ending stop, so the spoken line always ends in exactly one.
 */
const stripTrailingSentencePunctuation = (text: string): string =>
  text.replace(/[.!?]$/, "");

/** Strip the `---` frontmatter block; returns the MDX body unchanged if absent. */
export function stripFrontmatter(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return raw;
  return lines.slice(end + 1).join("\n");
}

/** Collapse a single markdown line into plain spoken prose. */
export function flattenLine(line: string): string {
  let s = line;

  // Code-fence delimiters carry no prose — drop a line that opens/closes a
  // fence. Handles bare ```, a language-tagged opener ```json, and ~~~.
  if (/^\s*(```|~~~)/.test(s)) {
    const after = s.replace(/^\s*(```|~~~)/, "").trim();
    const residue = after.replace(/[`~]/g, "").trim();
    // Only a short info-string (```json) or delimiters → no prose; drop.
    if (residue.length === 0 || (after.length <= 16 && !/\s/.test(residue))) return "";
  }

  // Protect inline-code spans: tokenize their literal contents so the HTML
  // strip below can't eat an angle-bracketed token (e.g. `` `<Item>` ``).
  const codeTokens: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, body) => {
    codeTokens.push(body);
    return `\u0000${codeTokens.length - 1}\u0000`;
  });

  // links: keep the label, drop the URL — `[label](url)` -> `label`
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // raw HTML tags / bare autolink URLs: strip tags but keep wrapped prose
  // (`<strong>bold</strong>` -> `bold`; `<br>` -> nothing) so no markup text
  // is ever spoken, yet real sentence content survives
  s = s.replace(/<[^>]+>/g, "");
  // stray backtick fence markers that survived -> space
  s = s.replace(/`+/g, " ");
  // emphasis / strikethrough / blockquote / heading / pipe markers -> space
  s = s.replace(/[*_~#>|]+/g, " ");
  // footnote markers [^n]
  s = s.replace(/\[\^\d+\]/g, "");
  // strip leading list / bullet / numeric / blockquote markers
  // (`- x`, `* x`, `+ x`, `1. x`, `1) x`, `> x`, `## x`)
  s = s.replace(/^\s*(?:(?:[-*+]\s+)|(?:\d+[.)]\s+)|(?:>\s*)|(?:[#]+\s+))+/i, "");
  // horizontal-rule only lines (`---`, `***`) -> nothing
  if (/^[\s]*[-*_]{3,}[\s]*$/.test(s)) return "";
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  // restore protected inline-code literals (after ALL stripping so `>` /
  // `=` / leading-space tokens inside backticks survive verbatim)
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codeTokens[Number(i)]);
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
  // resolve a diagram's spoken text: description:: override wins, else alt.
  // Normalize trailing sentence punctuation so the lead-in's own `.` never
  // produces a double stop (real lesson alts already end in a period).
  const resolveDiagram = (src: SpokenDiagramInput) => {
    const text = src.description?.trim() ? src.description : src.alt;
    return leadIn(stripTrailingSentencePunctuation(text));
  };

  const lines = body.split("\n");
  const out: string[] = [];
  // The trailing GFM citation block (its auto-generated "Sources" heading is
  // produced by the renderer, so it is NOT present in the MDX — the block is a
  // run of footnote *definition* lines `[^n]: ...`). Speak the summary once.
  let sourcesSpoken = false;

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
      else if (/^sources$/i.test(text) && !sourcesSpoken) {
        // trailing Sources citation list — don't read URLs verbatim
        sourcesSpoken = true;
        out.push("Sources are listed at the end of the article.");
      }
      continue;
    }

    // Footnote *definition* line `[^n]: <citation>` — the GFM Sources block.
    // Real articles never carry a `## Sources` heading in source (the renderer
    // auto-generates it), so the block is just these lines at the end. They
    // are citations, not prose: never read the title/URL aloud. Emit the
    // summary sentence once at the top of the block, then skip the rest.
    if (/^\[\^\d+\]\s*:/.test(trimmed)) {
      if (!sourcesSpoken) {
        sourcesSpoken = true;
        out.push("Sources are listed at the end of the article.");
      }
      continue;
    }

    if (trimmed.startsWith("description::")) continue; // stray override line

    out.push(flattenLine(trimmed));
  }

  return out.filter(Boolean).join("\n");
}
