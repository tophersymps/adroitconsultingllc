### Print styles for the exam cram sheet (cram-sheet-print)

**What** - the cram sheet at `/atlas/[series]/cram` is now laid out for paper. `globals.css` gains an
`@media print` block scoped to the sheet's own classes: site chrome hidden, the semantic tokens reset to
print values for BOTH `:root` and `html.dark`, a compacted type scale, keep-together rules for objectives,
bullets and trap boxes, and a repeating table header. The page gains `cram-sheet`, `cram-domain`,
`cram-objective`, `cram-stats`, `cram-weighting` and `cram-chrome` hooks, and its weighting table gets
fixed column widths so the two numeric columns align under the rule instead of stranding in a cluster.

**Why** - the sheet exists to be printed and carried, but it was dressed as a web page. Measured before:
printing it produced **15 pages**, because the prose layer is built for screen at 18px with 1.8 leading
and 44px heading margins, which made a single objective (a heading, two rules and a trap) **91mm tall**.
The token reset is the part that matters most: the site themes by remapping semantic tokens under
`html.dark`, so a reader in dark mode would have printed light text onto white paper.

**Verified** - rendered the real page markup against the site's own compiled CSS in a `file://` harness,
switched the tab to print media with `Emulation.setEmulatedMedia`, and printed to PDF with
`Page.printToPDF`. Then parsed the PDF with pymupdf: **9 pages** (down from 15), average page fill **76%**,
**0 of 26 objectives split across a page break**, **0 orphaned headings** (no page ends on a heading), and
the table's computed `table-layout: fixed` with columns at 80/47/47mm.

Each objective is kept whole on purpose. Content needs 7.1 pages at 100% fill and the sheet uses 9; the
gap is that guarantee, which is the right trade for a revision sheet, because a split objective separates
a trap from its rule. Every page still fills 74 to 98% except one at 63% and the inherent short final page.

**Known Issues** - the sheet is print-ready but has no on-page print affordance (no button or hint); the
reader uses the browser's own print. Widths are tuned for Letter and A4 alike, but only Letter was
measured.
