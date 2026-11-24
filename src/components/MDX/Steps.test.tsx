/**
 * `<Steps>` / `<Step>` contract: a real `<ol>` (not a styled `<div>`) whose items
 * carry a block lead-in title that does not become a heading (ADR-705).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Step, Steps } from "@/components/MDX/Steps";
import { parseHtml } from "@/test-utils/mdx";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/MDX/Steps.tsx"),
  "utf-8",
);

const BODY = (
  <Steps>
    <Step title="Drain the queue">Stop accepting writes first.</Step>
    <Step title="Verify the count">Compare row counts before resuming.</Step>
  </Steps>
);

function render(): HTMLElement {
  return parseHtml(renderToStaticMarkup(BODY));
}

describe("Steps", () => {
  it("renders one ol.fn-steps — a real ordered list, not a div", () => {
    const dom = render();
    const lists = dom.querySelectorAll("ol.fn-steps");
    expect(lists).toHaveLength(1);
    expect(lists[0].tagName.toLowerCase()).toBe("ol");
    expect(dom.querySelector("div.fn-steps")).toBeNull();
  });

  it("exposes the list through the accessibility tree (role=list)", () => {
    const dom = render();
    expect(dom.querySelector("ol")?.getAttribute("class")).toContain(
      "fn-steps",
    );
    // A plain <ol> maps to the list role; the numbered marker is real.
    expect(dom.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("renders one li.fn-step per Step", () => {
    const dom = render();
    const items = dom.querySelectorAll("li.fn-step");
    expect(items).toHaveLength(2);
  });

  it("shows each Step's title as .fn-step-title, above the body copy", () => {
    const items = render().querySelectorAll("li.fn-step");
    const first = items[0];
    const title = first.querySelector(".fn-step-title")!;
    expect(title.textContent).toBe("Drain the queue");
    // The lead-in is the first child, so it renders above the body text.
    expect(first.firstElementChild).toBe(title);
    expect(first.textContent).toBe(
      "Drain the queueStop accepting writes first.",
    );
  });

  it("does not promote the lead-in to a heading", () => {
    const dom = render();
    expect(dom.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(0);
  });

  it("is server-only code with no hardcoded colour", () => {
    expect(SOURCE).not.toContain('"use client"');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\brgba?\(/);
  });
});
