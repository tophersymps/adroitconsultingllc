/**
 * `MDXSources` end-to-end: it runs the real `compileMDX` pipeline, so the test
 * awaits the server component directly and serialises the element it returns.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MDXSources from "@/components/MDX/MDXSources";
import {
  DOC_DEFINITIONS_ONLY,
  DOC_WITHOUT_SOURCES,
  DOC_WITH_SOURCES,
  SPLIT_BODY_PLUGINS,
  parseHtml,
  renderMdx,
} from "@/test-utils/mdx";

async function renderSources(mdx: string): Promise<string | null> {
  const element = await MDXSources({ mdx });
  return element === null ? null : renderToStaticMarkup(element);
}

describe("MDXSources", () => {
  it("renders exactly one footnotes section with one li per definition", async () => {
    const html = await renderSources(DOC_WITH_SOURCES);
    expect(html).not.toBeNull();
    const dom = parseHtml(html!);

    expect(dom.querySelectorAll("section[data-footnotes]")).toHaveLength(1);
    expect(dom.querySelectorAll("li#user-content-fn-1")).toHaveLength(1);
    expect(dom.querySelectorAll("li#user-content-fn-2")).toHaveLength(1);
    expect(dom.querySelector("h2#footnote-label")?.textContent).toBe("Sources");
    expect(html).not.toContain("Intro paragraph with a citation");
  });

  it("returns null when the document has no footnote definitions", async () => {
    expect(await renderSources(DOC_WITHOUT_SOURCES)).toBeNull();
  });

  it("returns null when definitions exist but no reference emits a section", async () => {
    expect(await renderSources(DOC_DEFINITIONS_ONLY)).toBeNull();
  });

  it("backrefs target the ids the split body render emits", async () => {
    const html = (await renderSources(DOC_WITH_SOURCES))!;
    const sources = parseHtml(html);
    const body = parseHtml(await renderMdx(DOC_WITH_SOURCES, SPLIT_BODY_PLUGINS));

    const bodyRefIds = Array.from(
      body.querySelectorAll('a[id^="user-content-fnref-"]'),
    ).map((a) => a.getAttribute("id"));
    expect(bodyRefIds.length).toBeGreaterThan(0);

    const backrefHrefs = Array.from(
      sources.querySelectorAll('a[href^="#user-content-fnref-"]'),
    ).map((a) => a.getAttribute("href"));
    expect(backrefHrefs.length).toBeGreaterThan(0);

    for (const id of bodyRefIds) {
      expect(backrefHrefs).toContain(`#${id}`);
    }
    // The sources render must not contain a duplicate of a body id.
    const bodyIds = Array.from(body.querySelectorAll("[id]")).map((el) =>
      el.getAttribute("id"),
    );
    const sourcesIds = Array.from(sources.querySelectorAll("[id]")).map((el) =>
      el.getAttribute("id"),
    );
    expect(sourcesIds.filter((id) => bodyIds.includes(id))).toEqual([]);
  });

  it("renders no duplicate of the body content (only the sources list)", async () => {
    const sources = parseHtml((await renderSources(DOC_WITH_SOURCES))!);
    // GFM wraps a definition's text in a <p> inside its <li>: assert on the
    // top-level shape (one section, nothing else) and on the absence of the
    // body's own headings, rather than on inner tag names.
    expect(sources.children).toHaveLength(1);
    expect(sources.children[0].tagName.toLowerCase()).toBe("section");
    expect(sources.querySelectorAll(":scope > p")).toHaveLength(0);
    expect(sources.querySelector(":scope > h2")).toBeNull();
    expect(sources.textContent).not.toContain("Body copy that must not appear");
  });
});
