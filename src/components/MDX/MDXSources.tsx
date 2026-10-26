/**
 * Sources-only render of a lesson's MDX document.
 *
 * The Learn lesson page renders the body with `<MDXArticle sources="split" />`
 * (footnote section dropped) and then this component for the sources list, so
 * the citations can be the last content block instead of sitting immediately
 * after the body.
 *
 * Both renders compile the same source through the same pipeline; only the
 * final tree differs. That is what keeps footnote numbering, ids and
 * back-reference targets in agreement with the body render by construction.
 *
 * Renders inside the caller's `.article-body` container (no wrapper of its
 * own) so typography, link styles and dark-mode tokens are inherited. Returns
 * `null` when the document has no footnotes section — never an empty heading.
 */
import type { ReactElement } from "react";
import { hasFootnoteDefinitions } from "@/lib/lesson-sources";
import {
  type HastRoot,
  isFootnoteSection,
  keepOnlyFootnoteSection,
  markLessonSources,
  renameFootnoteHeading,
} from "@/components/MDX/footnote-plugins";

type MDXSourcesProps = {
  /** MDX body (frontmatter already stripped + citations linkified). */
  mdx: string;
};

type MDXOptions = NonNullable<
  import("next-mdx-remote/rsc").MDXRemoteProps["options"]
>;

export default async function MDXSources({
  mdx,
}: MDXSourcesProps): Promise<ReactElement | null> {
  // Cheap pre-check: no definitions ⇒ remark-gfm cannot emit a section, so
  // skip the whole second compile (all current lessons have definitions, but
  // the guard keeps the component honest on prose-only lessons).
  if (!hasFootnoteDefinitions(mdx)) return null;

  const [{ compileMDX }, remarkGfm, Figure] = await Promise.all([
    import("next-mdx-remote/rsc"),
    import("remark-gfm"),
    import("@/components/BlogPost/Figure"),
  ]);

  /*
   * Compile eagerly (instead of returning <MDXRemote />) so the rehype pass —
   * and therefore the "is there a section?" answer — has already run when this
   * async component resolves. A document can declare definitions without ever
   * referencing them; remark-gfm then emits no section, and we must render
   * nothing rather than an empty block.
   */
  let sawFootnoteSection = false;
  const detectFootnoteSection = () => (tree: HastRoot): HastRoot => {
    sawFootnoteSection = tree.children.some((child) =>
      isFootnoteSection(child),
    );
    return tree;
  };

  const options: MDXOptions = {
    mdxOptions: {
      remarkPlugins: [remarkGfm.default],
      rehypePlugins: [
        renameFootnoteHeading,
        markLessonSources,
        keepOnlyFootnoteSection,
        detectFootnoteSection,
      ],
    },
  };

  const { content } = await compileMDX({
    source: mdx,
    components: { img: Figure.default },
    options,
  });

  return sawFootnoteSection ? content : null;
}
