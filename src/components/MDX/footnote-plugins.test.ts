/**
 * Behavioural tests for the two-render footnotes split.
 *
 * Everything here runs the real next-mdx-remote compile + rehype pipeline
 * (see `@/test-utils/mdx`), so the assertions are about the HTML the lesson
 * page will actually ship: footnote ids, back-reference targets, and the
 * presence/absence of `section[data-footnotes]`.
 */
import type { Root } from "hast";
import { describe, expect, it } from "vitest";
import {
  dropFootnoteSection,
  isFootnoteSection,
  keepOnlyFootnoteSection,
  renameFootnoteHeading,
} from "@/components/MDX/footnote-plugins";
import {
  DOC_WITHOUT_SOURCES,
  DOC_WITH_SOURCES,
  INLINE_PLUGINS,
  SOURCES_PLUGINS,
  SPLIT_BODY_PLUGINS,
  parseHtml,
  renderMdx,
} from "@/test-utils/mdx";

describe("isFootnoteSection", () => {
  const node = (props: Record<string, unknown>, tagName = "section") =>
    ({ type: "element", tagName, properties: props }) as never;

  it("matches section[data-footnotes]", () => {
    expect(isFootnoteSection(node({ dataFootnotes: true }))).toBe(true);
  });

  it("matches section.footnotes when the data attribute is absent", () => {
    expect(isFootnoteSection(node({ className: ["footnotes"] }))).toBe(true);
    expect(isFootnoteSection(node({ className: "footnotes" }))).toBe(true);
  });

  it("ignores sections that are not the footnotes section", () => {
    expect(isFootnoteSection(node({ className: ["notes"] }))).toBe(false);
    expect(isFootnoteSection(node({}))).toBe(false);
  });

  it("ignores non-element nodes and non-section elements", () => {
    expect(isFootnoteSection({ type: "text", value: "x" } as never)).toBe(
      false,
    );
    expect(
      isFootnoteSection(node({ dataFootnotes: true }, "div")),
    ).toBe(false);
  });
});

describe("body render", () => {
  it("inline (default) keeps the footnotes section — today's behaviour", async () => {
    const html = await renderMdx(DOC_WITH_SOURCES, INLINE_PLUGINS);
    const dom = parseHtml(html);
    expect(dom.querySelectorAll("section[data-footnotes]")).toHaveLength(1);
    expect(dom.querySelector("#user-content-fn-1")).not.toBeNull();
  });

  it("split keeps the inline references but drops the footnotes section", async () => {
    const html = await renderMdx(DOC_WITH_SOURCES, SPLIT_BODY_PLUGINS);
    const dom = parseHtml(html);

    // Body content survives.
    expect(dom.textContent).toContain("Intro paragraph with a citation");
    expect(dom.textContent).toContain("Body copy that must not appear");
    expect(dom.querySelector("h2")?.textContent).toBe("A heading");

    // References survive, pointing at the ids the sources render will emit.
    const refs = dom.querySelectorAll('a[id^="user-content-fnref-"]');
    expect(refs).toHaveLength(2);
    expect(refs[0].getAttribute("id")).toBe("user-content-fnref-1");
    expect(refs[0].getAttribute("href")).toBe("#user-content-fn-1");
    expect(refs[1].getAttribute("id")).toBe("user-content-fnref-2");
    expect(refs[1].getAttribute("href")).toBe("#user-content-fn-2");

    // The section, its list and its heading are all gone — no duplicate ids.
    expect(dom.querySelectorAll("section[data-footnotes]")).toHaveLength(0);
    expect(dom.querySelectorAll("section")).toHaveLength(0);
    expect(dom.querySelector("#user-content-fn-1")).toBeNull();
    expect(dom.querySelector("#footnote-label")).toBeNull();
    expect(dom.querySelectorAll("li")).toHaveLength(0);
  });

  it("split renders a document with no sources unchanged", async () => {
    const inline = await renderMdx(DOC_WITHOUT_SOURCES, INLINE_PLUGINS);
    const split = await renderMdx(DOC_WITHOUT_SOURCES, SPLIT_BODY_PLUGINS);
    expect(split).toBe(inline);
    expect(parseHtml(split).querySelectorAll("section")).toHaveLength(0);
  });
});

describe("sources render", () => {
  it("emits exactly one li#user-content-fn-1 per definition and nothing else", async () => {
    const html = await renderMdx(DOC_WITH_SOURCES, SOURCES_PLUGINS);
    const dom = parseHtml(html);

    expect(dom.querySelectorAll("section[data-footnotes]")).toHaveLength(1);
    const items = dom.querySelectorAll('li[id^="user-content-fn-"]');
    expect(items).toHaveLength(2);
    expect(dom.querySelectorAll("li#user-content-fn-1")).toHaveLength(1);
    expect(dom.querySelectorAll("li#user-content-fn-2")).toHaveLength(1);
    expect(dom.querySelector("li#user-content-fn-1")?.textContent).toContain(
      "https://example.com/first",
    );

    // Heading keeps the article convention.
    expect(dom.querySelector("h2#footnote-label")?.textContent).toBe("Sources");

    // No body content leaks into the sources render: the only top-level node
    // is the footnotes section (GFM wraps each definition's text in a <p>
    // *inside* its <li> — that is the list content, not body copy).
    expect(dom.children).toHaveLength(1);
    expect(dom.children[0].tagName.toLowerCase()).toBe("section");
    expect(dom.querySelectorAll(":scope > p")).toHaveLength(0);
    expect(dom.querySelectorAll("h2:not(#footnote-label)")).toHaveLength(0);
  });

  it("backrefs in the sources render match every body fnref id", async () => {
    const body = parseHtml(
      await renderMdx(DOC_WITH_SOURCES, SPLIT_BODY_PLUGINS),
    );
    const sources = parseHtml(await renderMdx(DOC_WITH_SOURCES, SOURCES_PLUGINS));

    const bodyRefIds = Array.from(
      body.querySelectorAll('a[id^="user-content-fnref-"]'),
    ).map((a) => a.getAttribute("id"));
    expect(bodyRefIds).toEqual([
      "user-content-fnref-1",
      "user-content-fnref-2",
    ]);

    const backrefHrefs = Array.from(
      sources.querySelectorAll('a[href^="#user-content-fnref-"]'),
    ).map((a) => a.getAttribute("href"));

    for (const id of bodyRefIds) {
      expect(backrefHrefs).toContain(`#${id}`);
    }
    // Every backref points at an id the body render actually emits.
    for (const href of backrefHrefs) {
      expect(bodyRefIds).toContain(href!.slice(1));
    }
  });

  it("renders nothing for a document with no definitions", async () => {
    const html = await renderMdx(DOC_WITHOUT_SOURCES, SOURCES_PLUGINS);
    expect(html).toBe("");
    const dom = parseHtml(html);
    expect(dom.querySelectorAll("section")).toHaveLength(0);
    expect(dom.querySelector("h2")).toBeNull();
  });

  it("renders nothing for a document with definitions but no references", async () => {
    const html = await renderMdx(
      "Prose with no markers.\n\n[^1]: Unused source.\n",
      SOURCES_PLUGINS,
    );
    expect(parseHtml(html).querySelectorAll("section")).toHaveLength(0);
    expect(parseHtml(html).textContent).toBe("");
  });
});

describe("filters are top-level only", () => {
  const tree = (children: Root["children"]): Root => ({ type: "root", children });

  it("drops only root-level footnote sections", () => {
    const nested = {
      type: "element",
      tagName: "div",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "section",
          properties: { dataFootnotes: true },
          children: [],
        },
      ],
    } as never;
    const section = {
      type: "element",
      tagName: "section",
      properties: { dataFootnotes: true },
      children: [],
    } as never;
    const para = {
      type: "element",
      tagName: "p",
      properties: {},
      children: [],
    } as never;

    const dropped = dropFootnoteSection()(tree([para, nested, section]));
    expect(dropped.children).toHaveLength(2);

    const kept = keepOnlyFootnoteSection()(tree([para, nested, section]));
    expect(kept.children).toHaveLength(1);
    expect(isFootnoteSection(kept.children[0])).toBe(true);
  });

  it("renameFootnoteHeading walks nested nodes", () => {
    const heading = {
      type: "element",
      tagName: "h2",
      properties: { id: "footnote-label" },
      children: [{ type: "text", value: "Footnotes" }],
    };
    const treeWithHeading = tree([
      {
        type: "element",
        tagName: "section",
        properties: { dataFootnotes: true },
        children: [heading],
      } as never,
    ]);
    const renamed = renameFootnoteHeading()(treeWithHeading);
    const section = renamed.children[0] as never as {
      children: { children: { value: string }[] }[];
    };
    expect(section.children[0].children[0].value).toBe("Sources");
  });
});
