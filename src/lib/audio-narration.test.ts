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

  it("does NOT speak the h1 document title (redundant with the page title, and it has no scroll-sync block)", () => {
    // Lessons carry `# Lesson N: Title` as the document title. The page already
    // shows it, so speaking it is redundant — and the player's scroll-sync
    // block extraction excludes h1, so an h1 cue segment would mis-align and
    // jump the page past the opening paragraphs. The h1 must be silent.
    const mdx = `# Lesson 1: What AI Actually Is
Every department is getting the same pitch right now.
## What AI actually is
Strip away the hype.`;
    const narration = mdxToNarration(mdx, { lesson: true });
    expect(narration).not.toContain("Section: Lesson 1: What AI Actually Is.");
    // the first spoken line is the opening paragraph, not the title
    expect(narration.startsWith("Every department is getting the same pitch right now.")).toBe(true);
    // h2 section cues are still emitted
    expect(narration).toContain("Section: What AI actually is.");
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

describe("mdxToNarration lesson mode (ADR-106/107 smart narration)", () => {
  const FULL_LESSON = `## Deep Dive
Read this concept carefully.
![A diagram of object permissions and CRUD system vs object profiles.](</diagrams/perms.png>)
## Worked example
The worked example explains it.
## Configuration Walkthrough
Configure these settings.
## Exam Traps
Watch out for the trap here.
## Try It
1. Open your sandbox.
2. Create a custom object.
3. Assign the permission set.
## What's Next
Next lesson covers sharing rules.
## Related Requirements
Requirement REQ-1 is listed here.
Requirement REQ-2 is listed here.
## References
[^1]: A reference document, [ref.com](https://ref.com)`;

  it("fixture contains every section the assertions rely on cutting or keeping", () => {
    for (const h of [
      "## Deep Dive",
      "## Worked example",
      "## Configuration Walkthrough",
      "## Exam Traps",
      "## Try It",
      "## What's Next",
      "## Related Requirements",
      "## References",
    ]) {
      expect(FULL_LESSON).toContain(h);
    }
  });

  it("reads learning content (Deep Dive, Worked example, Config, Exam Traps) and diagrams", () => {
    const narration = mdxToNarration(FULL_LESSON, { lesson: true });
    expect(narration).toContain("Section: Deep Dive.");
    expect(narration).toContain("Read this concept carefully.");
    expect(narration).toContain("Section: Worked example.");
    expect(narration).toContain("The worked example explains it.");
    expect(narration).toContain("Section: Configuration Walkthrough.");
    expect(narration).toContain("Configure these settings.");
    expect(narration).toContain("Section: Exam Traps.");
    expect(narration).toContain("Watch out for the trap here.");
    // all diagram descriptions are read (Diagram:<alt>.)
    expect(narration).toContain(
      "Diagram: A diagram of object permissions and CRUD system vs object profiles.",
    );
    expect(narration).not.toContain("</diagrams/perms.png>");
  });

  it("replaces the Try It body with one bridge line and does not read its steps", () => {
    const narration = mdxToNarration(FULL_LESSON, { lesson: true });
    expect(narration).toContain(
      "This lesson includes a hands-on exercise you can do in your sandbox.",
    );
    // the step-by-step body must NOT be read
    expect(narration).not.toContain("Open your sandbox.");
    expect(narration).not.toContain("Create a custom object.");
    expect(narration).not.toContain("Assign the permission set.");
    // Section heading for Try It is not emitted as a section cue
    expect(narration).not.toContain("Section: Try It.");
    // exactly one bridge line regardless of how many steps
    expect(narration.match(/hands-on exercise/g)).toHaveLength(1);
  });

  it("skips Related Requirements and References bodies (nothing emitted)", () => {
    const narration = mdxToNarration(FULL_LESSON, { lesson: true });
    expect(narration).not.toContain("Section: Related Requirements.");
    expect(narration).not.toContain("Requirement REQ-1");
    expect(narration).not.toContain("Requirement REQ-2");
    expect(narration).not.toContain("Section: References.");
    expect(narration).not.toContain("A reference document");
    expect(narration).not.toContain("ref.com");
  });

  it("still reads What's Next as recap (and does not cut it)", () => {
    const narration = mdxToNarration(FULL_LESSON, { lesson: true });
    expect(narration).toContain("Section: What's Next.");
    expect(narration).toContain("Next lesson covers sharing rules.");
  });

  it("matches a Try It subtitle variant (Try it: <X>)", () => {
    const mdx = "## Deep Dive\nSome learning body.\n## Try it: create a record\n1. Click New.\n## What's Next\nRecap line.";
    const narration = mdxToNarration(mdx, { lesson: true });
    expect(narration).toContain(
      "This lesson includes a hands-on exercise you can do in your sandbox.",
    );
    expect(narration).not.toContain("Click New.");
    expect(narration).not.toContain("Section: Try it: create a record.");
    // learning + What's Next survive
    expect(narration).toContain("Section: Deep Dive.");
    expect(narration).toContain("Section: What's Next.");
  });

  it("does NOT match near-miss headings that merely contain the words", () => {
    // Anchored matcher: these must be read as learning, not cut.
    const mdx =
      "## Spotting invented references\nLearn to spot fake citations.\n## The try-it: run your own extraction loop\nInside this section you do real work.\n## What's Next\nRecap.";
    const narration = mdxToNarration(mdx, { lesson: true });
    expect(narration).toContain("Section: Spotting invented references.");
    expect(narration).toContain("Learn to spot fake citations.");
    expect(narration).toContain(
      "Section: The try-it: run your own extraction loop.",
    );
    expect(narration).toContain("Inside this section you do real work.");
  });

  it("bridges AND keeps a Configuration Walkthrough (bridge line then body)", () => {
      const narration = mdxToNarration(FULL_LESSON, { lesson: true });
      // the spoken framing line is prepended before the section
      expect(narration).toContain(
        "Here is how this is configured in a sandbox. I will walk through the steps and the reasoning. You can run the exact clicks when you are back at the UI.",
      );
      // the section cue is still emitted
      expect(narration).toContain("Section: Configuration Walkthrough.");
      // the walkthrough BODY is NOT cut (unlike Try It) — sequence + why + traps
      expect(narration).toContain("Configure these settings.");
    });

    it("emits the walkthrough bridge exactly once per lesson", () => {
      const mdx =
        "## Deep Dive\nSome learning.\n## Configuration Walkthrough\nStep one.\n## Setup walkthrough\nStep two.\n## What's Next\nRecap.";
      const narration = mdxToNarration(mdx, { lesson: true });
      expect(narration.match(/Here is how this is configured in a sandbox/g)).toHaveLength(1);
      // both walkthrough bodies are read
      expect(narration).toContain("Step one.");
      expect(narration).toContain("Step two.");
    });

    it("detects walkthrough-style heading variants (Configuration steps, Setup walkthrough, Walkthrough)", () => {
      for (const h of [
        "## Configuration Walkthrough",
        "## Configuration steps",
        "## Setup walkthrough",
        "## Walkthrough",
      ]) {
        const mdx = `## Deep Dive\nSome learning.\n${h}\nThe walkthrough body.\n## What's Next\nRecap.`;
        const narration = mdxToNarration(mdx, { lesson: true });
        expect(narration).toContain(
          "Here is how this is configured in a sandbox. I will walk through the steps and the reasoning. You can run the exact clicks when you are back at the UI.",
        );
        expect(narration).toContain("The walkthrough body.");
      }
    });

    it("does NOT bridge near-miss headings that merely contain the words", () => {
      const mdx =
        "## Deep Dive\nSome learning.\n## Configuration: models and providers\nRead this as learning.\n## What's Next\nRecap.";
      const narration = mdxToNarration(mdx, { lesson: true });
      // no bridge line emitted
      expect(narration).not.toContain("Here is how this is configured in a sandbox");
      // the near-miss heading is read as a normal learning section
      expect(narration).toContain("Section: Configuration: models and providers.");
      expect(narration).toContain("Read this as learning.");
    });

    it("appends the KC transition exactly once as the final line", () => {
    const narration = mdxToNarration(FULL_LESSON, { lesson: true });
    const lines = narration.split("\n");
    const kc =
      "That's the lesson. When you're ready, return to the lesson page to complete the knowledge check and test what you've heard.";
    expect(narration.match(/knowledge check/g)).toHaveLength(1);
    expect(lines[lines.length - 1]).toBe(kc);
  });

  it("appends KC transition AFTER any Sources summary, as the last line", () => {
    // If a lesson carries a trailing footnote def, its summary line must come
    // before the KC transition (transition is always final).
    const mdx =
      "## Deep Dive\nBody text.[^1]\n[^1]: A citation doc.\n## Try It\nStep one.\n";
    const narration = mdxToNarration(mdx, { lesson: true });
    const last = narration.split("\n").reverse().join("\n");
    expect(last.startsWith("That's the lesson.")).toBe(true);
    expect(last.indexOf("Sources are listed at the end of the article.")).toBeGreaterThan(0);
  });

  it("does not append the KC transition when no learning content was emitted", () => {
    const mdx = "## Try It\n1. Do a thing.\n## Related Requirements\nA req.";
    const narration = mdxToNarration(mdx, { lesson: true });
    // Degenerate interactive-only lesson: the bridge is spoken, but there is
    // no learning content, so no KC hand-off pointing at a non-existent quiz.
    expect(narration).not.toContain("knowledge check");
    expect(narration).not.toContain("Do a thing.");
    expect(narration).not.toContain("A req.");
    expect(narration).toContain("hands-on exercise");
  });

  it("article mode is byte-for-byte unchanged from pre-refinement (regression guard)", () => {
    const mdx =
      "## The subsystem\nWe call an API with `maxRetries = 3`.\n![A bar chart](</diagrams/x.png>)\n## Try It\nThis is article body, not a lesson cut.\n";
    const article = mdxToNarration(mdx); // lesson falsy
    // Try It is read normally in article mode
    expect(article).toContain("Section: Try It.");
    expect(article).toContain("This is article body, not a lesson cut.");
    expect(article).toContain("Diagram: A bar chart.");
    // no KC transition appended in article mode
    expect(article).not.toContain("knowledge check");
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