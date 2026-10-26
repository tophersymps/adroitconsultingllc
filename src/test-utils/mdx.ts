/**
 * Test-only helpers for the MDX body/sources split.
 *
 * The real renderers are async React server components, so the tests exercise
 * the exact same next-mdx-remote pipeline they use (`compileMDX` + the rehype
 * plugins from `footnote-plugins`) and serialise the result to HTML with
 * `react-dom/server`. That keeps assertions on real output — ids, hrefs,
 * sections — rather than on mocks of the thing under test.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import {
  dropFootnoteSection,
  keepOnlyFootnoteSection,
  renameFootnoteHeading,
} from "@/components/MDX/footnote-plugins";

/** Two references, two definitions — the shape every Learn lesson has. */
export const DOC_WITH_SOURCES = [
  "Intro paragraph with a citation[^1] and a second one[^2].",
  "",
  "## A heading",
  "",
  "Body copy that must not appear in the sources render.",
  "",
  "[^1]: First source — https://example.com/first",
  "[^2]: Second source — https://example.com/second",
].join("\n");

/** References but no definitions: remark-gfm leaves them as literal text. */
export const DOC_WITHOUT_SOURCES = [
  "Intro paragraph with no citations at all.",
  "",
  "## A heading",
  "",
  "Body copy only.",
].join("\n");

/** Definitions but no references: remark-gfm emits no footnotes section. */
export const DOC_DEFINITIONS_ONLY = [
  "Prose with no markers.",
  "",
  "[^1]: Unused source — https://example.com/unused",
].join("\n");

/** Frozen copy of the pre-split MDXArticle plugin (rename only). */
type LegacyNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: LegacyNode[];
  value?: string;
};

function legacyRenameFootnoteHeading() {
  return (tree: LegacyNode): LegacyNode => {
    const walk = (node: LegacyNode) => {
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

/** Plugin lists matching each render the production components perform. */
export const INLINE_PLUGINS = [renameFootnoteHeading];
export const SPLIT_BODY_PLUGINS = [renameFootnoteHeading, dropFootnoteSection];
export const SOURCES_PLUGINS = [renameFootnoteHeading, keepOnlyFootnoteSection];
export const LEGACY_PLUGINS = [legacyRenameFootnoteHeading];

/** Compile `mdx` through a given rehype pipeline and serialise it to HTML. */
export async function renderMdx(
  mdx: string,
  rehypePlugins: unknown[],
): Promise<string> {
  const { content } = await compileMDX({
    source: mdx,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: rehypePlugins as never,
      },
    },
  });
  return renderToStaticMarkup(content);
}

/** Parse an HTML string into a detached element for DOM queries. */
export function parseHtml(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}
