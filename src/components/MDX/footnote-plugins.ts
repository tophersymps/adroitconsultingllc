/**
 * Rehype plugins shared by the two MDX renders of a Learn lesson.
 *
 * `remark-gfm` appends a single `<section data-footnotes>` node at the end of
 * the document whenever the document has both footnote references and
 * definitions. The Learn "Sources last" layout needs that section to render
 * *separately* from the body, so the two renders filter the same compiled
 * tree: the body render drops the section, the sources render keeps only it.
 * Filtering at the rehype stage (never at the source level) is what keeps
 * footnote numbering, ids and back-reference targets identical between the
 * two renders — they are the same compile pipeline, only the tree differs.
 *
 * Both filters touch top-level children only: the section is always a root
 * child (verified against real lessons, architecture.md §3.1).
 */
import type { Root, RootContent } from "hast";

export type HastRoot = Root;
export type HastNode = Root | RootContent;

type SectionLike = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
};

/**
 * Shared predicate: is this node the GFM footnotes section?
 *
 * `remark-gfm` emits `<section data-footnotes class="footnotes">`; hast
 * normalises `data-footnotes` to `properties.dataFootnotes`, and the class is
 * matched too so a future rehype version that drops the data attribute does
 * not silently reintroduce the section into the body render.
 */
export function isFootnoteSection(node: HastNode): boolean {
  const candidate = node as unknown as SectionLike;
  if (candidate.type !== "element" || candidate.tagName !== "section") {
    return false;
  }
  const properties = candidate.properties ?? {};
  if (properties.dataFootnotes !== undefined) return true;

  const className = properties.className;
  if (Array.isArray(className)) return className.includes("footnotes");
  if (typeof className === "string") {
    return className.split(/\s+/).includes("footnotes");
  }
  return false;
}

/** Rename the auto-generated footnote section heading from "Footnotes" to "Sources". */
export function renameFootnoteHeading() {
  return (tree: HastRoot): HastRoot => {
    const walk = (node: HastNode) => {
      const candidate = node as unknown as SectionLike & { children?: HastNode[] };
      if (
        candidate.type === "element" &&
        candidate.tagName === "h2" &&
        (candidate.properties as { id?: unknown } | undefined)?.id ===
          "footnote-label"
      ) {
        candidate.children = [{ type: "text", value: "Sources" } as HastNode];
      }
      candidate.children?.forEach(walk);
    };
    walk(tree);
    return tree;
  };
}

/** Remove the GFM footnotes section from the tree (used by the body render). */
export function dropFootnoteSection() {
  return (tree: HastRoot): HastRoot => {
    tree.children = tree.children.filter((child) => !isFootnoteSection(child));
    return tree;
  };
}

/** Remove everything EXCEPT the GFM footnotes section (used by the sources render). */
export function keepOnlyFootnoteSection() {
  return (tree: HastRoot): HastRoot => {
    tree.children = tree.children.filter((child) => isFootnoteSection(child));
    return tree;
  };
}
