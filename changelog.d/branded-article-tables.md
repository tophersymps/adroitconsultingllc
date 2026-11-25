### Branded data tables in the article prose layer (branded-article-tables)

**What** - adds a token-only table block to `src/app/globals.css`: `.article-body table`,
`.article-body thead th`, `.article-body tbody td`, a zebra rule on `tbody tr:nth-child(even)`, a
weighted `td:first-child`, and a `max-width: 640px` step that drops cell padding and font size. The
header row is mono, uppercase, letter-spaced, sitting on a 2px `--accent` rule; body cells get 12px
padding and a 1px `--border-default` row rule. There is deliberately no `html.dark` counterpart,
because every value is an existing token that the dark block already remaps.

**Why** - GFM pipe tables had no styling anywhere in this stylesheet. Measured on
`/field-notes/nextjs-16-cache-lifecycle-2026`: computed `border: 0px`, `padding: 0px`, no header
background, and the header distinguished from the body only by `font-weight: 700`, so a 5-column
table ran its columns together and was hard to parse. 51 Learn lessons and 11 Field Notes articles
already ship tables, so this retro-fits an existing surface rather than introducing a new one.
Requested by the owner on 2026-11-25 alongside the Agentforce Specialist reading-structure pass,
which adds 59 tables to that course alone.

**Verified** - served the page from a local dev server, pulled the compiled CSS chunk and confirmed
all six rules compile with the intended values (Lightning CSS normalises `nth-child(even)` to
`2n`). Rendered a `file://` harness against that same compiled stylesheet in both themes: light
gives `padding: 12px`, `border-bottom: 2px solid rgb(200, 16, 46)` and zebra `rgb(249, 250, 251)`;
dark gives `border-bottom: 2px solid rgb(240, 80, 102)`, zebra `rgb(14, 21, 38)` and body text
`rgb(203, 213, 225)` on `rgb(10, 14, 26)`.

**Known Issues** - tables are authored at 2-3 columns with short cells so they fit the 68ch article
measure. A wider table will wrap rather than scroll horizontally, because `display: block` is
deliberately not used to fake overflow on a table element: it collapses the internal table layout
and stacks every cell as its own block. Adding a scroll wrapper is a component change, not a CSS one.
