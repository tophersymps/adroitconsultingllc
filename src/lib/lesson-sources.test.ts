import { describe, expect, it } from "vitest";
import { hasFootnoteDefinitions } from "@/lib/lesson-sources";

const DOC_WITH_SOURCES = [
  "Intro paragraph with a citation[^1] and a second one[^2].",
  "",
  "[^1]: First source — https://example.com/first",
  "[^2]: Second source — https://example.com/second",
].join("\n");

const DOC_DEFINITIONS_ONLY = [
  "Prose with no markers.",
  "",
  "[^1]: Unused source — https://example.com/unused",
].join("\n");

describe("hasFootnoteDefinitions", () => {
  it("returns true for a document with footnote definitions", () => {
    expect(hasFootnoteDefinitions(DOC_WITH_SOURCES)).toBe(true);
  });

  it("returns true for a definitions-only document", () => {
    expect(hasFootnoteDefinitions(DOC_DEFINITIONS_ONLY)).toBe(true);
  });

  it("returns false for prose with no definitions", () => {
    expect(hasFootnoteDefinitions("Body copy only.\n\n## Heading\n")).toBe(
      false,
    );
  });

  it("returns false for a bare reference with no definition line", () => {
    expect(hasFootnoteDefinitions("Body text with a marker[^1].\n")).toBe(
      false,
    );
  });

  it("returns false for a definition marker that does not start a line", () => {
    expect(hasFootnoteDefinitions("see [^1]: inline text\n")).toBe(false);
  });

  it("is anchored per line (multi-line documents)", () => {
    expect(hasFootnoteDefinitions("line one\n[^x]: definition\n")).toBe(true);
  });

  it("handles definitions at the very start of the document", () => {
    expect(hasFootnoteDefinitions("[^a]: source\n\nBody text.\n")).toBe(true);
  });
});
