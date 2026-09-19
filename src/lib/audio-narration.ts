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
 *
 * Lesson mode (ADR-106/107, opt-in via `opts.lesson`): the article path is
 * byte-for-byte unchanged when `lesson` is falsy. When truthy, section
 * routing is gated on an interactive-heading ALLOWLIST — `Try It` (replaced
 * by a single spoken bridge line), `Related Requirements` and `References`
 * (skipped, nothing emitted) — and the knowledge-check transition is appended
 * once as the final line. A Configuration Walkthrough section is BRIDGED AND
 * KEPT (ADR-106/107 keep + bridge): a spoken framing line is prepended before
 * it, then the section body (sequence + why + traps) is read as normal — it
 * is NOT cut like Try It. Everything else (Deep Dive, Worked example, Exam
 * Traps, What's Next, ...) is read as learning content.
 */

/** Diagram-source resolver: prefer an explicit description:: override, else alt. */
export interface NarrationOverrides {
  /** Wrapper for each spoken diagram line. Default: (alt) => `Diagram: ${alt}.` */
  leadIn?: (alt: string) => string;
  /** Optional diag-resolver extension point (contract NarrationOptions). */
  diagramSource?: (src: SpokenDiagramInput) => string;
  /**
   * Lesson-aware section routing (ADR-106/107). When truthy, the narration
   * reads only LEARNING content: the interactive sections a listener cannot
   * act on (`Try It`, `Related Requirements`, `References`) are cut — `Try
   * It` is replaced by a single spoken bridge line, the other two emit
   * nothing — and the knowledge-check transition is appended once as the
   * final line. `What's Next` is still read (recap + preview). Articles omit
   * this; the article path is byte-for-byte unchanged when it is falsy.
   */
  lesson?: boolean;
  /** Spoken line that replaces the `Try It` section body in lesson mode. */
  tryItBridge?: string;
  /**
   * Spoken framing line prepended before a Configuration Walkthrough section
   * in lesson mode (ADR-106/107 keep + bridge). The walkthrough body is NOT
   * cut (unlike Try It) — the bridge reframes the mouse-click steps for a
   * listener, then the section content (sequence + why + traps) is read as
   * normal. Defaults to a single em-dash-free line.
   */
  walkthroughBridge?: string;
  /** Closing knowledge-check hand-off, appended last in lesson mode. */
  knowledgeCheckTransition?: string;
}

/** A figure's spoken-diagram source (mirrors contract SpokenDiagramSource). */
export interface SpokenDiagramInput {
  alt: string;
  /** Optional per-diagram override from a `description::` line. */
  description?: string;
}

const defaultLeadIn = (alt: string) => `Diagram: ${alt}.`;

/* Lesson-mode defaults (ADR-106/107). Em-dash-free spoken copy. */
const DEFAULT_TRY_IT_BRIDGE =
  "This lesson includes a hands-on exercise you can do in your sandbox.";
const DEFAULT_WALKTHROUGH_BRIDGE =
  "Here is how this is configured in a sandbox. I will walk through the steps and the reasoning. You can run the exact clicks when you are back at the UI.";
const DEFAULT_KC_TRANSITION =
  "That's the lesson. When you're ready, return to the lesson page to complete the knowledge check and test what you've heard.";

/**
 * Interactive-heading classifier for lesson mode (ADR-106). The interactive
 * set a listener cannot act on is tiny and closed: `Try It` (with an optional
 * `: <subtitle>` suffix), `Related Requirements`, and `References`. Matching
 * is on the NORMALIZED heading text (trim + lowercase + collapse whitespace)
 * and anchored to the heading start, so near-miss headings that merely
 * contain the words ("Spotting invented references", "The try-it: run your
 * own extraction loop") do NOT match. Everything else is learning by default.
 */
const isTryIt = (normalized: string) => /^try it([:\s]|$)/.test(normalized);
const isExactInteractive = (normalized: string) =>
  normalized === "related requirements" || normalized === "references";

/**
 * Walkthrough-heading classifier for lesson mode (ADR-106/107 keep + bridge).
 * A Configuration Walkthrough section is written for a reader at the UI
 * (mouse-click steps), so the clicks are un-actionable to a listener — but it
 * is where the mechanism and exam traps live, so it is NOT cut (unlike Try
 * It). Instead a spoken framing line is prepended and the body is read as
 * normal. The heading text varies across lessons ("Configuration
 * Walkthrough", "Configuration steps", "Setup walkthrough", "Walkthrough"),
 * so matching is anchored to the heading start on the NORMALIZED text and
 * accepts a `configuration`/`config`/`setup` prefix followed by
 * `walkthrough`/`steps`, or a bare `walkthrough`. Near-miss headings that
 * merely contain the words ("Configuration: models and providers") do NOT
 * match.
 */
const isWalkthrough = (normalized: string) =>
  /^walkthrough([:\s]|$)/.test(normalized) ||
  /^(configuration|config|setup)\s+(walkthrough|steps?)([:\s]|$)/.test(normalized);

/** Normalize a heading's text for the interactive classifier. */
const normalizeHeading = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

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

  // Lesson mode (ADR-106/107): while inside an interactive section (Try It /
  // Related Requirements / References), skip every line until a heading at
  // level <= the interactive heading's level arrives, then route that heading
  // normally (so `What's Next` is read). skipLevel === 0 means "not skipping".
  const lesson = Boolean(opts.lesson);
  const tryItBridge = opts.tryItBridge ?? DEFAULT_TRY_IT_BRIDGE;
  const walkthroughBridge = opts.walkthroughBridge ?? DEFAULT_WALKTHROUGH_BRIDGE;
  const kcTransition = opts.knowledgeCheckTransition ?? DEFAULT_KC_TRANSITION;
  let skipLevel = 0;
  let tryItBridged = false;
  let walkthroughBridged = false;
  // True once any actual LEARNING line (heading, diagram, body prose) is
  // emitted. The Try It bridge alone is not lesson content, so a degenerate
  // interactive-only lesson must NOT get a KC hand-off pointing at a quiz
  // that never followed (ADR-107: transition appended only if learning was).
  let learningEmitted = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Heading: # ... -> "Section: ...." (also the section-boundary signal that
    // clears lesson-mode skipping).
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const text = flattenLine(heading[2]);
      const normalized = normalizeHeading(heading[2]);

      // A heading at level <= the interactive section's level ends the skip.
      if (skipLevel > 0 && level <= skipLevel) skipLevel = 0;

      if (lesson && skipLevel === 0) {
        if (isTryIt(normalized)) {
          // Interactive: replace the whole section body with one bridge line.
          skipLevel = level;
          if (!tryItBridged) {
            tryItBridged = true;
            out.push(tryItBridge);
          }
          continue;
        }
        if (isExactInteractive(normalized)) {
          // Interactive: skip the section body, emit nothing.
          skipLevel = level;
          continue;
        }
        if (isWalkthrough(normalized)) {
          // Keep + bridge (ADR-106/107): prepend a spoken framing line, then
          // fall through to read the section body as normal. Unlike Try It,
          // the walkthrough is NOT cut — the sequence, why, and traps must
          // still come through to the listener.
          if (!walkthroughBridged) {
            walkthroughBridged = true;
            out.push(walkthroughBridge);
          }
        }
      }

      if (text && !/^sources$/i.test(text)) {
        out.push(`Section: ${text}.`);
        learningEmitted = lesson;
      }
      else if (/^sources$/i.test(text) && !sourcesSpoken) {
        // trailing Sources citation list — don't read URLs verbatim
        sourcesSpoken = true;
        out.push("Sources are listed at the end of the article.");
      }
      continue;
    }

    // Inside a skipped interactive section: drop paragraphs, diagrams,
    // footnote definitions, and deeper headings until the boundary above.
    if (skipLevel > 0) continue;

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
      if (text) {
        out.push(text);
        if (lesson) learningEmitted = true;
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
    if (lesson) learningEmitted = true;
  }

  // Lesson mode: append the knowledge-check transition once, as the final
  // line, only if learning content was actually emitted (ADR-107).
  if (lesson && learningEmitted) out.push(kcTransition);

  return out.filter(Boolean).join("\n");
}
