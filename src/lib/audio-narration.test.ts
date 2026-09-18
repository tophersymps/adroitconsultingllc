/**
 * audio-narration.test.ts — narration script generator (plan Phase 1).
 *
 * Verifies the pure MDX→narration transformation: frontmatter stripping,
 * heading → section cues, inline code read literally, links collapsed to
 * label, footnote markers dropped, and — the diagram-description contract —
 * each `![alt](path)` image becomes a spoken `Diagram: <alt>.` line (the
 * Figure component's existing accessible caption), with an optional
 * `description::` override honored.
 */
import { describe, it, expect } from "vitest";
import { mdxToNarration, stripFrontmatter, flattenLine } from "./audio-narration";

describe("stripFrontmatter", () => {
  it("strips a leading YAML frontmatter block", () => {
    const raw = "---\ntitle: x\n---\nBody text";
    expect(stripFrontmatter(raw)).toBe("Body text");
  });

  it("returns the input unchanged when there is no frontmatter", () => {
    expect(stripFrontmatter("Just a body")).toBe("Just a body");
  });
});

describe("mdxToNarration", () => {
  it("returns empty string for empty/whitespace input", () => {
    expect(mdxToNarration("")).toBe("");
    expect(mdxToNarration("   \n  ")).toBe("");
  });

  it("renders a heading as a section cue and reads inline code literally", () => {
    const mdx = "## The subsystem\nWe call an API with `maxRetries = 3`.";
    const narration = mdxToNarration(mdx);
    expect(narration).toContain("Section: The subsystem.");
    // inline code read literally (backticks removed, content kept)
    expect(narration).toContain("maxRetries = 3");
    expect(narration).not.toContain("`");
  });

  it("collapses markdown links to their label (URL dropped)", () => {
    const mdx = "See [OpenTelemetry](https://opentelemetry.io) for spans.";
    const narration = mdxToNarration(mdx);
    expect(narration).toContain("See OpenTelemetry for spans");
    expect(narration).not.toContain("opentelemetry.io");
  });

  it("injects a spoken diagram description from the image alt (the Figure contract)", () => {
    const mdx =
      "A chart of MAU.\n![A bar chart of MAU growth over six months](</diagrams/x.png>)";
    const narration = mdxToNarration(mdx);
    expect(narration).toContain("Diagram: A bar chart of MAU growth over six months.");
  });

  it("honors a description:: override after an image", () => {
    const mdx =
      "![Small caption](</diagrams/y.png>)\ndescription:: A detailed spoken walkthrough of how the pipeline stages data.";
    const narration = mdxToNarration(mdx);
    expect(narration).toContain(
      "Diagram: A detailed spoken walkthrough of how the pipeline stages data.",
    );
    // The bare terse alt must NOT be the spoken line
    expect(narration).not.toContain("Diagram: Small caption.");
  });

  it("strips footnote markers and replaces the Sources tail with a summary sentence", () => {
    const mdx = "LangChain found this in 2026.[^1]\n## Sources\n[^1]: ref";
    const narration = mdxToNarration(mdx);
    expect(narration).not.toContain("[^1]");
    expect(narration).toContain("Sources are listed at the end of the article.");
  });

  it("does NOT read the GFM footnote-definition block (real articles have no Sources heading)", () => {
    // Real articles' "Sources" section is the renderer's auto-generated
    // heading over a run of footnote *definition* lines `[^n]: ...`. These
    // must not be spoken as prose (titles + URLs read aloud == the bug).
    const mdx =
      "LangChain found this in 2026.[^1]\n[^1]: LangChain, \"Evaluating AI Agents.\" [langchain.com](https://langchain.com/blog/evals)\n[^2]: Maxim AI, \"Top 5 Platforms for AI Agent Evaluation.\" [maxim.ai](https://maxim.ai/guides)";
    const narration = mdxToNarration(mdx);
    // citation titles never spoken
    expect(narration).not.toContain("Evaluating AI Agents");
    expect(narration).not.toContain("Top 5 Platforms");
    // URLs never spoken (only the inline content line remains)
    expect(narration).not.toContain("langchain.com");
    expect(narration).not.toContain("maxim.ai");
    // the summary sentence is emitted exactly once
    expect(narration).toContain("Sources are listed at the end of the article.");
    expect(narration.match(/Sources are listed at the end of the article\./g)).toHaveLength(1);
    // original content prose survives
    expect(narration).toContain("LangChain found this in 2026.");
  });

  it("applies a custom leadIn wrapper for diagrams", () => {
    const mdx = "![An architecture diagram](</diagrams/a.png>)";
    const narration = mdxToNarration(mdx, {
      leadIn: (alt) => `Figure spoken: ${alt}.`,
    });
    expect(narration).toBe("Figure spoken: An architecture diagram.");
  });

  it("does not emit a double period when the alt already ends in a period", () => {
    // Real lesson diagram alts end in a sentence-ending period; the default
    // lead-in appends its own `.`, which previously produced a double stop
    // (`...or products..`) that a TTS engine reads as two pauses.
    const mdx =
      "![A diagram of object permissions and CRUD system vs object profiles.](</diagrams/perms.png>)";
    const narration = mdxToNarration(mdx);
    expect(narration).toBe(
      "Diagram: A diagram of object permissions and CRUD system vs object profiles.",
    );
    expect(narration).not.toMatch(/\.\.$/);
  });

  it("normalizes trailing sentence punctuation for description:: overrides too", () => {
    const mdx =
      "![Small caption](</diagrams/y.png>)\ndescription:: A detailed spoken walkthrough of how the pipeline stages data.";
    const narration = mdxToNarration(mdx);
    expect(narration).toBe(
      "Diagram: A detailed spoken walkthrough of how the pipeline stages data.",
    );
    expect(narration).not.toMatch(/\.\.$/);
  });

  it("keeps a single trailing period when the alt has no sentence punctuation", () => {
    const mdx = "![A bar chart of MAU growth](</diagrams/x.png>)";
    const narration = mdxToNarration(mdx);
    expect(narration).toBe("Diagram: A bar chart of MAU growth.");
  });

  it("normalizes a real pilot article into speakable prose without raw diagram paths", () => {
    const mdx = `---
title: "Most Teams Can See Their Agents"
slug: agent-eval-infrastructure-2026
---
## The eval layer
Most teams can trace their agent.
![A bar chart showing 52% run offline evals and 37% online ones](</diagrams/eval.png>)`;
    const narration = mdxToNarration(mdx);
    // frontmatter stripped, no YAML residue
    expect(narration).not.toContain("title:");
    expect(narration).toContain("Section: The eval layer.");
    expect(narration).toContain(
      "Diagram: A bar chart showing 52% run offline evals and 37% online ones.");
    // raw diagram path never leaks into narration
    expect(narration).not.toContain("</diagrams/");
  });
});

describe("flattenLine — clean-text narration (no \\n / html / bullet artifacts)", () => {
  it("drops bare code-fence lines (``` / ~~~ / with language tag)", () => {
    expect(flattenLine("```")).toBe("");
    expect(flattenLine("~~~")).toBe("");
    expect(flattenLine("```json")).toBe("");
    expect(flattenLine("```js")).toBe("");
  });

  it("strips leading bullet markers (- / * / +)", () => {
    expect(flattenLine("- team: alpha")).toBe("team: alpha");
    expect(flattenLine("* point one")).toBe("point one");
    expect(flattenLine("+ plus item")).toBe("plus item");
  });

  it("strips numbered-list and blockquote markers", () => {
    expect(flattenLine("1. first step")).toBe("first step");
    expect(flattenLine("12) step twelve")).toBe("step twelve");
    expect(flattenLine("> a quoted line")).toBe("a quoted line");
  });

  it("strips raw HTML tags and bare autolink URLs", () => {
    // tags removed, wrapped prose kept; bare <br>/autolink leave no text
    expect(flattenLine("Keep <strong>bold</strong> prose")).toBe("Keep bold prose");
    expect(flattenLine("a <br> break")).toBe("a break");
    expect(flattenLine("see <https://example.com> for details")).toBe("see for details");
  });

  it("preserves inline-code literal contents, even angle-bracketed tokens", () => {
    expect(flattenLine("call `getUser(<id>)` now")).toBe("call getUser(<id>) now");
    expect(flattenLine("max `retries = 3`")).toBe("max retries = 3");
  });

  it("collapses a mixed messy line to plain prose with no markup", () => {
    const out = flattenLine("- <br> agents run `evals` daily");
    expect(out).not.toMatch(/\\n|```|- |<[^>]+>/);
    expect(out).toBe("agents run evals daily");
  });
});