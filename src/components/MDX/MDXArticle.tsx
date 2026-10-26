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
 *
 * `sources` is additive and defaults to `"inline"` — today's behaviour, byte
 * identical for every existing caller (blog, both previews, paywall peek).
 * Learn lesson pages pass `sources="split"` to drop the footnote section from
 * the body render so the page can place the sources list itself (as the last
 * content block, after the knowledge-check block).
 */
import type { ComponentProps } from "react";
import {
  dropFootnoteSection,
  renameFootnoteHeading,
} from "@/components/MDX/footnote-plugins";

export type MDXArticleProps = {
  /** MDX body (frontmatter already stripped + citations linkified). */
  mdx: string;
  /**
   * `"inline"` (default) = sources render inside the body, exactly as today.
   * `"split"` = the body render drops the GFM footnotes section so the caller
   * can render it separately with `<MDXSources />`.
   */
  sources?: "inline" | "split";
};

type MDXRemoteProps = ComponentProps<typeof import("next-mdx-remote/rsc").MDXRemote>;

export default async function MDXArticle({
  mdx,
  sources = "inline",
}: MDXArticleProps) {
  const [{ MDXRemote }, remarkGfm, Figure] = await Promise.all([
    import("next-mdx-remote/rsc"),
    import("remark-gfm"),
    import("@/components/BlogPost/Figure"),
  ]);

  const options: MDXRemoteProps["options"] = {
    mdxOptions: {
      remarkPlugins: [remarkGfm.default],
      rehypePlugins:
        sources === "split"
          ? [renameFootnoteHeading, dropFootnoteSection]
          : [renameFootnoteHeading],
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
