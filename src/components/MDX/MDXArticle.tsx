/**
 * Shared MDX Article Renderer — extracted from the two public detail pages
 * (blog + learn) so the gated /preview routes render pixel-identical output.
 *
 * Uses next-mdx-remote/rsc for server-side MDX rendering. Editorial citations
 * use GFM endnotes: `[^n]` inline markers (rendered as superscripts) map to an
 * auto-generated numbered source list at the end of the article, labelled
 * "Sources". remark-gfm renders the superscript + numbered-section natively
 * (no raw HTML, no extra plugins); the footnote section's sr-only <h2> label
 * defaults to "Footnotes", so a rehype plugin renames it to "Sources" (the
 * CSS reveals it as the visible heading). Both blog AND learn apply the
 * rename since 2026-08-16 (Chris: Learn sources must match article convention).
 */
import type { ComponentProps } from "react";

type MDXArticleProps = {
  /** MDX body (frontmatter already stripped + citations linkified). */
  mdx: string;
  /** "blog" applies the footnote→Sources rename; "learn" keeps remark-gfm default. */
  kind?: "blog" | "learn";
};

type FootnoteNode = {
  type: string;
  tagName?: string;
  properties?: { id?: unknown };
  children?: FootnoteNode[];
  value?: string;
};

/** Rename the auto-generated footnote section heading from "Footnotes" to "Sources". */
function renameFootnoteHeading() {
  return (tree: FootnoteNode) => {
    const walk = (node: FootnoteNode) => {
      if (
        node.type === "element" &&
        node.tagName === "h2" &&
        node.properties?.id === "footnote-label"
      ) {
        node.children = [{ type: "text", value: "Sources" }];
      }
      node.children?.forEach(walk);
    };
    walk(tree);
    return tree;
  };
}

type MDXRemoteProps = ComponentProps<typeof import("next-mdx-remote/rsc").MDXRemote>;

export default async function MDXArticle({
  mdx,
  kind = "blog",
}: MDXArticleProps) {
  const [{ MDXRemote }, remarkGfm, Figure] = await Promise.all([
    import("next-mdx-remote/rsc"),
    import("remark-gfm"),
    import("@/components/BlogPost/Figure"),
  ]);

  const options: MDXRemoteProps["options"] = {
    mdxOptions: {
      remarkPlugins: [remarkGfm.default],
      rehypePlugins: [renameFootnoteHeading],
    },
  };

  return (
    <MDXRemote
      source={mdx}
      components={{ img: Figure.default }}
      options={options}
    />
  );
}
