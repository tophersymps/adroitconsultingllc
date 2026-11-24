/**
 * `<TLDR>` contract: an `<aside aria-label="Summary">` with a `.fn-box-label`
 * lead-in and the author's list passed through untouched.
 *
 * Follows the `MDXSources.test.tsx` pattern — call the server component directly
 * and serialise with `renderToStaticMarkup`, so assertions run against real
 * output rather than a mock of the thing under test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TLDR } from "@/components/MDX/TLDR";
import { parseHtml } from "@/test-utils/mdx";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/MDX/TLDR.tsx"),
  "utf-8",
);

function render(children: React.ReactNode, title?: string): HTMLElement {
  return parseHtml(renderToStaticMarkup(<TLDR title={title}>{children}</TLDR>));
}

const LIST_3 = (
  <ul>
    <li>One</li>
    <li>Two</li>
    <li>Three</li>
  </ul>
);

describe("TLDR", () => {
  it("renders exactly one aside carrying the accessible name 'Summary'", () => {
    const dom = render(LIST_3);
    const asides = dom.querySelectorAll("aside");
    expect(asides).toHaveLength(1);
    expect(asides[0].getAttribute("aria-label")).toBe("Summary");
  });

  it("uses 'The short version' as the default box label", () => {
    const dom = render(LIST_3);
    expect(dom.querySelector(".fn-box-label")?.textContent).toBe(
      "The short version",
    );
  });

  it("lets a title prop override the box label", () => {
    const dom = render(LIST_3, "In brief");
    expect(dom.querySelector(".fn-box-label")?.textContent).toBe("In brief");
  });

  it("passes the markdown list through as a real ul with one li per item", () => {
    const dom = render(LIST_3);
    expect(dom.querySelectorAll("ul")).toHaveLength(1);
    expect(dom.querySelectorAll("ul li")).toHaveLength(3);
  });

  it("roots the box in the fn-tldr class", () => {
    const dom = render(LIST_3);
    expect(dom.querySelector("aside")?.classList.contains("fn-tldr")).toBe(true);
  });

  it("is a server component with no hardcoded colour", () => {
    expect(SOURCE).not.toContain('"use client"');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\brgba?\(/);
  });
});
