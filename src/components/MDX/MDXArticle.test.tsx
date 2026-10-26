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
import { describe, expect, it } from "vitest";
import MDXArticle from "@/components/MDX/MDXArticle";
import { parseMDXFrontmatter } from "@/lib/mdx";
import {
  INLINE_PLUGINS,
  LEGACY_PLUGINS,
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
});
