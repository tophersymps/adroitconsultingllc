/**
 * `<Callout>` contract: exactly three whitelisted variants, and a typo degrades
 * to `rule` instead of emitting an unknown class (ADR-704).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Callout, type CalloutKind } from "@/components/MDX/Callout";
import { parseHtml } from "@/test-utils/mdx";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/MDX/Callout.tsx"),
  "utf-8",
);

/** Every variant class this component is allowed to emit. */
const VARIANTS = ["fn-callout--rule", "fn-callout--warning", "fn-callout--proof"];

function render(kind: CalloutKind): HTMLElement {
  return parseHtml(
    renderToStaticMarkup(<Callout kind={kind}>Body copy.</Callout>),
  );
}

describe("Callout", () => {
  it.each([
    ["rule", "Rule", "fn-callout--rule"],
    ["warning", "Warning", "fn-callout--warning"],
    ["proof", "Proof", "fn-callout--proof"],
  ] as const)(
    "kind=%s renders the %s variant with a matching accessible name",
    (kind, label, variantClass) => {
      const root = render(kind).querySelector("aside")!;
      expect(root.getAttribute("aria-label")).toBe(label);
      expect(root.classList.contains("fn-callout")).toBe(true);
      expect(root.classList.contains(variantClass)).toBe(true);
      expect(
        root.querySelector(".fn-box-label")?.textContent,
      ).toBe(label);
    },
  );

  it("falls back to the rule variant for an unknown kind", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = render("typo" as unknown as CalloutKind).querySelector(
      "aside",
    )!;

    expect(root.classList.contains("fn-callout--rule")).toBe(true);
    expect(root.getAttribute("aria-label")).toBe("Rule");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown kind="typo"'),
    );
    warn.mockRestore();
  });

  it("can never emit a class outside the three whitelisted variants", () => {
    const kinds = ["rule", "warning", "proof", "typo", "", "RULE"] as CalloutKind[];
    for (const kind of kinds) {
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      const root = render(kind).querySelector("aside")!;
      const variant = Array.from(root.classList).filter((c) =>
        c.startsWith("fn-callout--"),
      );
      expect(variant).toHaveLength(1);
      expect(VARIANTS).toContain(variant[0]);
      warnings.mockRestore();
    }
  });

  it("is a server component with no hardcoded colour", () => {
    expect(SOURCE).not.toContain('"use client"');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\brgba?\(/);
  });
});
