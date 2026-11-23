/**
 * `<KeyTakeaways>` contract: the same shape as `<TLDR>` but a distinct class, so
 * the two never read as the same box (ADR-703).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyTakeaways } from "@/components/MDX/KeyTakeaways";
import { parseHtml } from "@/test-utils/mdx";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/MDX/KeyTakeaways.tsx"),
  "utf-8",
);

function render(children: React.ReactNode, title?: string): HTMLElement {
  return parseHtml(
    renderToStaticMarkup(
      <KeyTakeaways title={title}>{children}</KeyTakeaways>,
    ),
  );
}

const LIST_4 = (
  <ul>
    <li>One</li>
    <li>Two</li>
    <li>Three</li>
    <li>Four</li>
  </ul>
);

describe("KeyTakeaways", () => {
  it("renders exactly one aside carrying the accessible name 'Key takeaways'", () => {
    const dom = render(LIST_4);
    const asides = dom.querySelectorAll("aside");
    expect(asides).toHaveLength(1);
    expect(asides[0].getAttribute("aria-label")).toBe("Key takeaways");
  });

  it("defaults the box label to 'Key takeaways' and honours an override", () => {
    expect(render(LIST_4).querySelector(".fn-box-label")?.textContent).toBe(
      "Key takeaways",
    );
    expect(
      render(LIST_4, "What to remember").querySelector(".fn-box-label")
        ?.textContent,
    ).toBe("What to remember");
  });

  it("renders one li per takeaway", () => {
    const dom = render(LIST_4);
    expect(dom.querySelectorAll("ul li")).toHaveLength(4);
  });

  it("is visually distinct from TLDR: fn-takeaways present, fn-tldr absent", () => {
    const root = render(LIST_4).querySelector("aside")!;
    expect(root.classList.contains("fn-takeaways")).toBe(true);
    expect(root.classList.contains("fn-tldr")).toBe(false);
  });

  it("is a server component with no hardcoded colour", () => {
    expect(SOURCE).not.toContain('"use client"');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\brgba?\(/);
  });
});
