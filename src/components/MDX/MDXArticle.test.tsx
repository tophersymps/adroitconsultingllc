/**
 * `MDXArticle` prop surface + the "blog output is unchanged" guard.
 *
 * `MDXArticle` is an async React server component that returns a
 * `<MDXRemote />` element; the options it hands that element are the pipeline
 * under test here (rendering is covered end-to-end in
 * `footnote-plugins.test.ts`). The last test renders a REAL blog post through
 * both the new default pipeline and a frozen copy of the pre-split
 * implementation and compares the HTML byte for byte.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import MDXArticle from "@/components/MDX/MDXArticle";
import { parseMDXFrontmatter } from "@/lib/mdx";
import {
  INLINE_PLUGINS,
  LEGACY_PLUGINS,
  parseHtml,
  renderMdx,
} from "@/test-utils/mdx";

type RemoteElementProps = {
  source: string;
  components: Record<string, unknown>;
  options: {
    mdxOptions?: {
      remarkPlugins?: unknown[];
      rehypePlugins?: { name: string }[];
    };
  };
};

async function articleOptions(props: {
  mdx: string;
  sources?: "inline" | "split";
}): Promise<RemoteElementProps> {
  const element = (await MDXArticle(props)) as ReactElement;
  return element.props as RemoteElementProps;
}

function pluginNames(options: RemoteElementProps["options"]): string[] {
  return (options.mdxOptions?.rehypePlugins ?? []).map(
    (plugin) => plugin.name,
  );
}

describe("MDXArticle", () => {
  it("defaults to the inline pipeline (rename only) — no caller change", async () => {
    const element = await articleOptions({ mdx: "Body[^1]\n\n[^1]: Source\n" });
    expect(pluginNames(element.options)).toEqual(["renameFootnoteHeading"]);
    expect(element.components).toHaveProperty("img");
  });

  it("treats sources='inline' exactly like the default", async () => {
    const element = await articleOptions({
      mdx: "Body[^1]\n\n[^1]: Source\n",
      sources: "inline",
    });
    expect(pluginNames(element.options)).toEqual(["renameFootnoteHeading"]);
  });

  it("adds the drop filter after the rename when sources='split'", async () => {
    const element = await articleOptions({
      mdx: "Body[^1]\n\n[^1]: Source\n",
      sources: "split",
    });
    expect(pluginNames(element.options)).toEqual([
      "renameFootnoteHeading",
      "dropFootnoteSection",
    ]);
  });

  it("renders a real blog post byte-identically to the pre-split pipeline", async () => {
    const raw = readFileSync(
      path.join(
        process.cwd(),
        "content/blog/acceptance-gate-consulting-delivery-2026.mdx",
      ),
      "utf-8",
    );
    const [, body] = parseMDXFrontmatter(raw);

    const legacy = await renderMdx(body, LEGACY_PLUGINS);
    const now = await renderMdx(body, INLINE_PLUGINS);
    expect(now).toBe(legacy);

    // Sanity: the fixture really does exercise the footnotes section.
    expect(now).toContain('data-footnotes="true"');
    expect(now).toContain(">Sources</h2>");
  });

  it("renders a real lesson byte-identically to the pre-split pipeline", async () => {
    const raw = readFileSync(
      path.join(
        process.cwd(),
        "content/learn/agentic-ai/agent-loop-by-hand-no-framework.mdx",
      ),
      "utf-8",
    );
    const [, body] = parseMDXFrontmatter(raw);

    const legacy = await renderMdx(body, LEGACY_PLUGINS);
    const now = await renderMdx(body, INLINE_PLUGINS);
    expect(now).toBe(legacy);
    expect(now).toContain('data-footnotes="true"');
  });

  it("registers exactly the six component names in the MDX components map", async () => {
    const element = await articleOptions({ mdx: "Body\n" });
    expect(Object.keys(element.components).sort()).toEqual([
      "Callout",
      "KeyTakeaways",
      "Step",
      "Steps",
      "TLDR",
      "img",
    ]);
  });

  /**
   * Integration: the four Field Notes components (t_6363f05a) compiled through
   * the SAME components map and the SAME `INLINE_PLUGINS` pipeline that
   * `MDXArticle` hands to `MDXRemote`. Blank-line block children are the
   * documented authoring form, so this also pins that they parse.
   */
  it("renders TLDR, Callout, Steps/Step and KeyTakeaways through the real pipeline", async () => {
    const source = [
      "<TLDR>",
      "",
      "- First point",
      "- Second point",
      "- Third point",
      "",
      "</TLDR>",
      "",
      "## A heading",
      "",
      '<Callout kind="warning">',
      "",
      "Watch the retry budget.",
      "",
      "</Callout>",
      "",
      "<Steps>",
      "",
      '<Step title="Drain the queue">',
      "",
      "Stop accepting writes first.",
      "",
      "</Step>",
      "",
      '<Step title="Verify the count">',
      "",
      "Compare row counts before resuming.",
      "",
      "</Step>",
      "",
      "</Steps>",
      "",
      "<KeyTakeaways>",
      "",
      "- Takeaway one",
      "- Takeaway two",
      "- Takeaway three",
      "- Takeaway four",
      "",
      "</KeyTakeaways>",
    ].join("\n");

    const element = await articleOptions({ mdx: source });
    const { content } = await compileMDX({
      source,
      components: element.components as never,
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: INLINE_PLUGINS as never,
        },
      },
    });
    const dom = parseHtml(renderToStaticMarkup(content));

    // One aside per box: TLDR + one Callout + KeyTakeaways.
    const asides = Array.from(dom.querySelectorAll("aside"));
    expect(asides).toHaveLength(3);
    expect(asides.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Summary",
      "Warning",
      "Key takeaways",
    ]);
    expect(dom.querySelectorAll("aside.fn-tldr ul li")).toHaveLength(3);
    expect(dom.querySelectorAll("aside.fn-takeaways ul li")).toHaveLength(4);

    // Steps is a real ordered list with one li per Step.
    const steps = dom.querySelectorAll("ol.fn-steps");
    expect(steps).toHaveLength(1);
    expect(dom.querySelectorAll("ol.fn-steps > li.fn-step")).toHaveLength(2);
    expect(
      Array.from(dom.querySelectorAll(".fn-step-title")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["Drain the queue", "Verify the count"]);
  });

  it("still throws for an unregistered component name (the map is mandatory)", async () => {
    const source = "<NotRegistered>text</NotRegistered>";
    const element = await articleOptions({ mdx: source });
    // `compileMDX` is lazy: the unknown name surfaces when the element renders,
    // not when it is compiled.
    const { content } = await compileMDX({
      source,
      components: element.components as never,
      options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
    });
    expect(() => renderToStaticMarkup(content)).toThrow(/NotRegistered/);
  });
});
