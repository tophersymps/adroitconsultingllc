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
import { mdxToNarration, stripFrontmatter } from "./audio-narration";

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

  it("applies a custom leadIn wrapper for diagrams", () => {
    const mdx = "![An architecture diagram](</diagrams/a.png>)";
    const narration = mdxToNarration(mdx, {
      leadIn: (alt) => `Figure spoken: ${alt}.`,
    });
    expect(narration).toBe("Figure spoken: An architecture diagram.");
  });

  it("normalizes a real pilot article into speakable prose without raw diagram paths", () => {
    const mdx = `---
title: "Most Teams Can See Their Agents"
slug: agent-eval-infrastructure-2026
---
## The eval layer
Most teams can trace their agent.
![A bar chart showing 52% run offline evals and 37% online ones](</diagrams/eval.png)`;
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