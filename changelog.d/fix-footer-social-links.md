### Footer social links corrected and a stray handle removed

**What** - `src/lib/nav.ts` now lists one footer social profile instead of two. The LinkedIn
entry points at `https://www.linkedin.com/company/adroit-io/` and the `X / Twitter` entry is
gone, because the company has no X account. `src/lib/seo.ts` no longer defines
`social.twitter: "@adroitconsult"`, a value that was never read by any metadata builder but would
have shipped a wrong-brand handle the moment someone wired `twitter:site`. `src/components/Footer.tsx`
now resolves the pill glyph through a `SOCIAL_GLYPH` map rather than a chained ternary, so adding
or removing a network does not leave a dead branch behind.

**Why** - Both footer links were wrong and both rendered on every page of the site. A crawl of all
261 sitemap pages found them on 497 rendered pages each. `linkedin.com/company/adroitconsulting`
returns 404: the company page does not exist. `twitter.com/adroitconsult` resolves to X user
`@AdroitConsult`, an unrelated web development and SEO agency, so the site was sending visitors to
another business. Neither link was ever configured by the company; the URLs were assumed during the
site merger.

**Verified** - `npx tsc -p tsconfig.json --noEmit` clean; `npm run lint` 0 errors (6 pre-existing
warnings in `src/lib/auth/server.test.ts`); `npm test` 183 files / 1779 tests pass; `npm run build`
succeeds. Live check of the replacement URL returns HTTP 200 and the old URL returns 404.

**Known Issues** - None. A separate sweep found 8 dead citation links inside published articles
(7 x 404, 1 x 410) which are unrelated to this change and are tracked separately.
