### Dead citations repaired across six published pieces

**What** - Six citations that no longer resolved were repaired. Five were one-line repoints to the
source's current home, one was a replacement source. Two footnotes were also re-scoped so they stop
attaching to sentences their new source does not support.

- `content/blog/salesforce-data-cloud-strategy-guide.mdx` - Trailhead module and product overview
  repointed. Salesforce renamed Data Cloud to Data 360, so the module is now "Data 360 Basics for
  Marketers" (`customer-360-audiences-basics`) and the product page is `/data/`.
- `content/blog/token-first-design-systems-2026.mdx` - Style Dictionary moved off Amazon's GitHub
  org; the inline link now points at `styledictionary.com`.
- `content/blog/daily-standup-coordination-ai-2026.mdx` - the Atlassian "AI efficiency paradox" post
  was re-slugged; repointed to `the-ai-efficiency-paradox-what-to-do-when-ai-boosts-productivity-but-not-results`.
- `content/blog/visual-regression-testing-design-systems-2026.mdx` - the cited vendor (getautonoma.com)
  is gone; the domain root 404s. Footnote 4 becomes Playwright's "Visual comparisons" doc for the
  baseline and pixel-diff mechanics, a new footnote 7 carries the tool-landscape claims from
  BrowserStack's 2026 tool guide, and footnote 4 is removed from four sentences asserting that
  AI-generated code is structurally correct but visually wrong, which neither replacement asserts.
- `content/blog/salesforce-stack-cost-modeling-2026.mdx` - techfastforward.com is gone; the domain
  root 404s. Footnote 1 becomes The Register's report of Gartner's AELA renewal warning, with two new
  primary citations: Salesforce's own flexible buying models page defining the AELA, and The Register
  on the three-year VA agreement. The AELA launch date is corrected from "early 2026" to October
  2025, the Gartner paragraph is reworded to what Decker and the research note actually say, and the
  $550 Agentforce 1 figure is attributed to the source that carries it.
- `content/learn/ai-at-work/low-risk-ways-to-start-automating-and-when-to-stop.mdx` - the cited
  koira.ai post was deleted (410, and the host has pivoted to trades marketing). Replaced with
  Novelis's three-variable automation framework plus arXiv:2505.18422, and footnote 3 is removed from
  three sentences about checkability and checking cost that the new sources do not cover.

**Why** - A sitemap-wide crawl found seven citations returning 404 or 410. Forensics mattered here:
none of the seven were fabricated. Five had Wayback captures with matching titles (the sources were
real and the hosts later died or moved), and two were ordinary vendor restructures. The shared root
cause is sourcing quality, not hallucination: the pipeline cited secondary SEO-oriented blogs, two of
whose domains are now dark, instead of primary documentation. Those citations rotted; vendor docs and
standards bodies do not.

**Verified** - Every replacement URL fetched live and read before use: Trailhead module 200,
`salesforce.com/data/` 200, `styledictionary.com` 200, Atlassian post 200 with the quoted State of
Teams 2026 figures present, Playwright docs 200, BrowserStack guide 200, The Register 200 for both
articles, Salesforce flexible buying models 200, Novelis 200, arXiv 200. `npm run prebuild` generates
159 posts and 515 lessons cleanly, `npm test` 184 files / 1804 tests pass, `npm run build` succeeds.
A repo-wide grep for all seven old URLs returns nothing.

Audio impact, measured with the repo's own `mdxToNarration` rather than assumed: five of the six files
produce byte-identical narration before and after, because footnote definitions and link hrefs are
never spoken (the renderer substitutes one sentence for the sources block). Only
`salesforce-stack-cost-modeling-2026` changes narration, from the AELA launch date and the reworded
Gartner paragraph, so only that article needs its MP3 regenerated.

**Known Issues** - The stack-cost article still says AELA terms run "two to three years". Public
reporting supports multi-year commitments and a confirmed three-year VA deal, but no live source states
the "two to three" range exactly, and the range is also baked into the `5-aela-renewal.png` diagram, so
narrowing the prose would require rebuilding that diagram. Left as is and flagged rather than silently
changed. Separately, `token-first-design-systems-2026` still describes Style Dictionary v5 as "currently
in progress"; v5.7.1 is now the published version. That is a staleness fix outside this change's scope.
