/**
 * Pure helpers over the raw MDX source for the Learn "Sources last" layout.
 *
 * These are string-only (no `fs`, no React, no MDX compile) so they can run
 * anywhere: the lesson page uses them to decide whether a second render
 * (the sources render) is worth doing at all.
 */

/**
 * True when the document declares at least one GFM footnote definition.
 *
 * A definition is a line matching `/^\[\^[^\]]+\]:/m` — the only way
 * `remark-gfm` can produce a `section[data-footnotes]` node (a reference
 * without a definition stays literal text, so it emits no section).
 */
export function hasFootnoteDefinitions(mdx: string): boolean {
  return /^\[\^[^\]]+\]:/m.test(mdx);
}
