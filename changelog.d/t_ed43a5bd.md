### Field Notes reading components: TLDR, KeyTakeaways, Callout, Steps (t_ed43a5bd)

**What** - Added four server-rendered MDX reading components under
`src/components/MDX/` (`TLDR`, `KeyTakeaways`, `Callout`, `Steps`/`Step`),
registered all five names in the shared `MDXArticle` components map, and appended
one additive unlayered `.fn-*` CSS section to `src/app/globals.css`. Added
per-component vitest suites plus two `MDXArticle` tests (the map has exactly six
keys; the four components render through the real `compileMDX` pipeline). Added a
`status: draft` demo article at `content/blog/field-notes-reading-components-demo.mdx`.
A follow-up fix on the same PR (t_bf30bba0) gave the four box-label colour rules
explicit `html.dark` counterparts at `(0,3,1)`, so each variant's label colour
survives the `(0,2,2)` dark prose override instead of collapsing to `--ink-body`,
and corrected the block header comment to describe that cascade honestly.

**Why** - Field Notes posts are long and flat: summary, cautions and procedural
steps read as ordinary paragraphs. Writers need boxes for them without hand-rolling
markup per article. The styling has to live in an unlayered `globals.css` block
rather than Tailwind utilities because `.article-body` rules are unlayered and
therefore beat every `@layer utilities` class regardless of specificity, so utility
overrides inside the article body are silent no-ops.

**Verified** - `npx tsc --noEmit`, `npx vitest run` and `npm run build` (each
reporting 192 published posts) all pass; `python3 scripts/verify_contrast.py`
stays green. The two pre-existing byte-identical `MDXArticle` tests pass
unmodified, which is the "published articles are unchanged" contract. The CSS
block references existing tokens only. Dark-mode label colours were measured in a
browser against the demo body (tldr and rule rgb(244,115,133) at 6.62:1,
takeaways and proof rgb(52,211,153) at 8.26:1, warning rgb(251,191,36) at 9.35:1)
and light mode is unchanged (four distinct label colours).

**Known Issues** - The Figure caption treatment named in the readability program
plan is a separate card and is deliberately not included here. The demo article
is a draft, so visual QA needs an allowlisted preview session
(`PREVIEW_ALLOWED_EMAILS`); without one the honest outcome is a recorded blocker.
