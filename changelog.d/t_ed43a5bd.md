### Field Notes reading components: TLDR, KeyTakeaways, Callout, Steps (t_ed43a5bd)

**What** - Added four server-rendered MDX reading components under
`src/components/MDX/` (`TLDR`, `KeyTakeaways`, `Callout`, `Steps`/`Step`),
registered all five names in the shared `MDXArticle` components map, and appended
one additive unlayered `.fn-*` CSS section to `src/app/globals.css`. Added
per-component vitest suites plus two `MDXArticle` tests (the map has exactly six
keys; the four components render through the real `compileMDX` pipeline). Added a
`status: draft` demo article at `content/blog/field-notes-reading-components-demo.mdx`.

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
block references existing tokens only, so both light and dark themes are remapped
by the existing `html.dark` block.

**Known Issues** - The Figure caption treatment named in the readability program
plan is a separate card and is deliberately not included here. The demo article
is a draft, so visual QA needs an allowlisted preview session
(`PREVIEW_ALLOWED_EMAILS`); without one the honest outcome is a recorded blocker.
