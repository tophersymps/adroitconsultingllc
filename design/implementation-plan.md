# Adroit Blog — Implementation Plan (Design Pass)

**Task:** t_71faff13 · **Author:** brainiac (web architect) · **Date:** 2026-08-05
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Consumers:** steel (implementation, t_51178c89) → zod (QA)
**Design source:** kara — `design/design-direction.md`, `design/design-tokens.css`, `design/mockup-*.html`, `design/design-system.html` (all verified, wow 6/6)

---

## 0. Critical starting context — the working tree already has most of the design

A previous mis-scoped run (run 2502) already applied a large portion of the design to `src/`.
Kara's task **did not revert it** (design-only scope). The build passes TODAY
(`npm run build` → exit 0, verified 2026-08-05).

**Do NOT re-implement what is already in place.** This plan is a DELTA — it lists
what is already done (verify, leave alone) and exactly what remains to be changed.

### Already implemented (verify visually, do not redo)
- Blog listing hero: kicker row, ambient glow, RSS pill, category pills with navy active state, mono counts
- PostCard: hover lift `-translate-y-1`, image zoom `group-hover:scale-[1.04]`, "Read more →" arrow slide, mono date/readTime
- FeaturedPost: pulsing Featured dot, image zoom, "Read article →" slide, navy panel
- Post detail: ShareBar with inline SVG icons + copy ✓ state, ReadingProgress red glow, blockquote/code/pre styling, PostNavigation hover lift
- Learn hub: hero glow, gradient display headline, grouped section headers with count badge + hairline rule
- PathCard: gradient band with radial glow, hover lift + "Start track" overlay, LessonProgress
- LessonCard: mono sequence badge, hover arrow slide, "New" pill
- Header: sticky + backdrop blur, active-link red underline indicator
- Footer: subscribe button + social hover polish
- Categories page: gradient category cards, icon chip, hover lift, subscribe CTA with red radial glow
- Tags pages: hero kicker + headline, elevated PostCard/FeaturedPost reuse
- `src/lib/mdx.ts` — `stripMDXFrontmatter()` fix (functional, already imported by blog/[slug]; **keep it** — reverting reintroduces the stray-frontmatter-heading bug)

---

## 1. Design tokens to ADD to `src/app/globals.css` (currently MISSING)

`design/design-tokens.css` defines tokens that have NOT yet been added to the
`@theme inline` block. Add these so Steel can use `shadow-card`,
`hover:shadow-card-hover`, and the category glows as real Tailwind utilities:

```css
@theme inline {
  --shadow-card: 0 1px 2px rgba(11, 29, 58, 0.04),
                 0 4px 12px -2px rgba(11, 29, 58, 0.06);
  --shadow-card-hover: 0 2px 4px rgba(11, 29, 58, 0.05),
                       0 16px 32px -12px rgba(11, 29, 58, 0.22),
                       0 8px 16px -8px rgba(200, 16, 46, 0.08);
  --shadow-glow-sf: 0 0 0 1px rgba(14, 165, 233, 0.12), 0 20px 40px -16px rgba(14, 165, 233, 0.25);
  --shadow-glow-react: 0 0 0 1px rgba(16, 185, 129, 0.12), 0 20px 40px -16px rgba(16, 185, 129, 0.25);
  --shadow-glow-ai: 0 0 0 1px rgba(245, 158, 11, 0.14), 0 20px 40px -16px rgba(245, 158, 11, 0.28);
  --shadow-glow-mkt: 0 0 0 1px rgba(236, 72, 153, 0.12), 0 20px 40px -16px rgba(236, 72, 153, 0.25);
}
```

Also add the global `prefers-reduced-motion` block (from design-tokens.css) to
the END of `src/app/globals.css` — it is currently missing and acceptance item #9
(motion discipline) depends on it:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transform: none !important;
  }
}
```

---

## 2. Delta — file-by-file change list (the actual work)

### 2.1 `src/app/globals.css` — article-body refinements (QA-gated)
Current `.article-body` does NOT meet the design acceptance criteria. Change:

| Rule | Current | Target (design-tokens.css) | Why |
|---|---|---|---|
| `.article-body` font-size | `1.0625rem` | **`1.125rem`** | QA #3: body ≥1.125rem |
| `.article-body` line-height | `1.85` | **`1.8`** | QA #3: ≥1.75 (fine either way; match tokens) |
| `.article-body h2` | `1.625rem`, no hairline | **`1.5rem` + `padding-bottom: 10px; border-bottom: 1px solid var(--color-gray-200)`** | QA #3: h2 bottom hairline |
| `.article-body h3` | `1.25rem` | **`1.125rem`** | match mockup |
| `.article-body a` | color red, underline 0.35 alpha, offset 3px | **color navy, `font-weight: 600`, `text-decoration-color: rgba(200,16,46,0.4)`, `text-decoration-thickness: 2px`, `text-underline-offset: 4px`** | QA #3: red underline decoration, editorial navy link text |
| `.article-body blockquote` | gradient bg + big `::before` quote glyph | **`background: var(--color-gray-50)`, remove `::before` glyph, `padding: 16px 24px`, `font-size: 1rem`** | mockup-post-detail |
| `.article-body ul li::marker` / list bullets | custom red squares | keep (already red) | — |

Note: `.article-body pre`, `code`, `hr`, `strong` are already good — leave them.

### 2.2 `src/components/BlogListing/FeaturedPost.tsx` — category glow + Featured pill (QA #2)
- **Category-tinted glow**: on the `<Link>` add
  `style={{ boxShadow: 'var(--shadow-glow-' + post.categoryColor + ')' }}`
  (fall back to `sf` for unknown colors). Keep `transition-all duration-300`.
- **Radial tint inside navy panel**: add a `::after`-equivalent — an absolutely
  positioned `pointer-events-none` div with
  `background: radial-gradient(60% 80% at 85% 20%, rgba(200,16,46,0.14) 0%, transparent 60%)`
  (per `.featured-glow` in design-tokens.css).
- **Featured pill**: change from `bg-red/15 text-red-light` to solid
  `bg-red text-white` with a **white** pulsing dot (`bg-white animate-pulse`).
- **Title**: `text-2xl md:text-3xl` (currently `text-xl md:text-2xl`).
- **Category chip on image**: add absolute chip top-left of the image side
  (like mockup `.featured-img .cat-chip`): `bg-white/18 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10.5px] font-bold text-white uppercase tracking-[0.06em]` with `post.category`.
- Keep: image zoom wrapper, "Read article →" slide, author/meta row.

### 2.3 `src/components/BlogListing/PostCard.tsx` — token-based elevation (QA #1)
- Resting: `shadow-card` (replace `shadow-md`-style flat look if present).
- Hover: `hover:-translate-y-1 hover:shadow-card-hover hover:border-navy/15`
  (currently `hover:shadow-xl hover:shadow-navy/8 hover:border-gray-300` — switch to token).
- Title: `text-lg tracking-tight` (currently `text-base`).
- Keep: image zoom, arrow slide, mono meta, category pill.

### 2.4 `src/app/blog/[slug]/page.tsx` — banner, author, tags (QA #3/#4 polish)
- **Banner**: bump to mockup spec —
  `h-[220px] md:h-[380px]`, `rounded-2xl`, add bottom **scrim**
  (`absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-navy/40`),
  add **category chip** overlay top-left (navy/45 + blur + 1px white/18 border, uppercase).
  Keep the outer `shadow-lg shadow-navy/10 ring-1 ring-gray-200`.
- **Author avatar**: `rounded-xl` (not full circle) + `ring-2 ring-white`
  + `hover:ring-red transition` on the container.
- **Tag pills**: hover `hover:text-navy` (currently gray-600) — design: pill hover → navy text.

### 2.5 `src/app/blog/page.tsx` — hero headline + kicker copy (QA: visual parity)
- **H1**: currently solid `text-navy`; mockup uses gradient text →
  `bg-gradient-to-r from-navy to-navy-light bg-clip-text text-transparent`
  (same treatment Learn already has). Keep clamp size.
- **Kicker**: align text to mockup "Adroit Consulting — Field Notes"
  (currently "Adroit Insights"). Keep red dot + mono styling.
- Category pills + RSS pill: already match; leave.

### 2.6 `src/app/learn/page.tsx` + `src/components/Learn/PathCard.tsx` — progress row prominence (QA #5)
- Learn page: hero + section count badges already done. No change needed.
- **PathCard**: wrap `LessonProgress` in a bordered progress row per design-tokens:
  `mt-4 pt-3 border-t border-gray-100` container so the counter reads as a
  deliberate "Lesson N of M" row, not floating meta.
- "Coming soon" badge: keep, but add `border border-dashed border-gray-300`
  refinement (design-direction 3.4).

### 2.7 `src/components/Learn/LessonCard.tsx` — sequence badge (design-direction 3.5)
- Badge: `rounded-xl` (currently `rounded-lg`), **red lesson number on navy**
  (`text-red` number, navy bg — currently white number). Keep hover arrow slide + tint.

### 2.8 `src/app/blog/categories/page.tsx` — photographic category cards (QA #7)
Current cards use flat pastel gradients. Mockup/QA require **photographic bands**:
- Add a `h-[108px]` image band at the top of each card with the category's
  image (use existing `public/banners/*.png` assets or copy Kara's
  `design/assets/*.jpg` into `public/categories/` — no new dependencies).
- Band: `overflow-hidden`, image `object-cover group-hover:scale-[1.05] transition-transform duration-500`,
  category **tint overlay** (multiply, per-category rgba: sf sky `rgba(14,165,233,.72)`,
  react emerald, ai amber, mkt pink) + bottom scrim `to-navy/55`.
- Icon chip: keep `w-10 h-10 rounded-lg bg-white shadow-sm` on the band (absolute, bottom-left).
- Post count → **mono pill**: `inline-flex items-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/90 font-mono text-[10.5px] font-bold` per category accent color.
- Hover: `hover:-translate-y-1` + **category-tinted glow** —
  `hover:shadow-[0_0_0_1px_rgba(14,165,233,0.14),0_20px_40px_-16px_rgba(14,165,233,0.28)]`
  (and equivalents per category; or add `--shadow-glow-*` classes from §1).
- Keep: subscribe CTA (already good).

### 2.9 `src/app/tags/page.tsx` — weighted tag cloud (QA #8)
- Current: uniform chips. Mockup: chips **scale by post count** (`lg` / `md` / `sm`).
- Bucket by count: top tercile → `lg` (`text-base px-[22px] py-[11px]`),
  middle → `md` (`text-sm`), bottom → `sm` (`text-[0.8rem] px-[15px] py-2 text-gray-500`).
- Keep: chip hover → navy, mono count badge, `border`, `shadow-card`.

### 2.10 `src/app/tags/[tag]/TagListingContent.tsx` — hero parity
- H1 → gradient text (`bg-gradient-to-r from-navy to-navy-light bg-clip-text text-transparent`),
  matching tags/listing heroes. Keep Suspense + SortToggle untouched.

### 2.11 Optional polish (only if cheap)
- `src/components/BlogPost/ShareBar.tsx`: bump SVG to 14px + button `w-9 h-9`
  per mockup `.share-btn` (currently 12px / w-8 h-8). Non-gating.

---

## 3. Must NOT change (hard constraints)

- `src/lib/sort.ts` — sort logic, `SortOrder`, `sortPosts` (QA #9)
- `BannerImage` component internals — `gradientMap`, watermark, fallback rendering (`src/components/BlogListing/BannerImage.tsx` is NOT in the modified set; keep it that way)
- Build scripts: `next.config.ts`, `package.json` scripts, `scripts/`
- `content/` — all MDX content, frontmatter
- `src/data/*`, `src/lib/learn.ts`, `src/lib/tags.ts`, `src/lib/seo.ts`, `src/app/feed.xml/route.ts`, `sitemap.ts`, `robots.ts`
- No new npm dependencies

---

## 4. Risks & constraints

1. **Client components + Suspense** — `src/app/blog/page.tsx` and
   `src/app/tags/[tag]/TagListingContent.tsx` are `"use client"` with
   `useSearchParams` inside a `Suspense` boundary. Class-only edits are safe;
   do NOT add hooks, move the Suspense boundary, or touch `SortToggle` logic.
2. **Category glow via inline style** — `FeaturedPost` is a server component;
   inline `boxShadow` is fine. Map unknown `categoryColor` → `sf` fallback.
3. **Category band images** — if copying `design/assets/*.jpg`, put them under
   `public/categories/` so `next/image` can serve them locally (no remote patterns needed).
4. **Reduced-motion block** — the global `transform: none !important` will disable
   the hover lifts under reduced motion; that is intended (motion discipline).
5. **Article typography is QA-gated** — do not skip §2.1; it is the most likely
   QA failure point (acceptance #3).
6. **Pre-existing dirty tree** — 19 modified `src/` files are uncommitted and
   intentional (partial design). Do NOT `git checkout` / revert them; build on top.

---

## 5. Verification (Steel)

1. `cd /Users/kelex/Documents/Fortress-of-Solitude/adroit-blog && npm run build` → must exit 0.
2. Spot-check pages in dev: `/blog`, `/blog/<slug>`, `/learn`, `/learn/<series>`,
   `/blog/categories`, `/tags`, `/tags/<tag>`.
3. Confirm `grep -n "1.125rem\|border-bottom" src/app/globals.css` hits for §2.1.
4. Confirm `src/lib/sort.ts` and `content/` show zero diff:
   `git diff --stat src/lib/sort.ts content/` → empty.
5. Leave changes uncommitted — orchestrator handles commit/push after QA.

---

## 6. Acceptance criteria mapping (zod will check)

| # | Criterion | Where | Status after this plan |
|---|---|---|---|
| 1 | PostCard lifts + image zooms | PostCard.tsx §2.3 | token-based, already working |
| 2 | FeaturedPost glow + zoom + pulsing dot | FeaturedPost.tsx §2.2 | NEW (glow + solid pill + chip) |
| 3 | Body ≥1.125rem, lh ≥1.75, h2 hairline, red-underline links | globals.css §2.1 | NEW (typography delta) |
| 4 | ShareBar SVG + copy ✓ | ShareBar.tsx (done) + §2.11 | already passing |
| 5 | PathCard progress prominent; section count badges | PathCard.tsx §2.6, learn page (done) | NEW (progress row border) |
| 6 | Focus-visible red ring | globals.css (already present) | already passing |
| 7 | Category cards photographic + glow | categories/page.tsx §2.8 | NEW (photo bands + tint + glow) |
| 8 | Tag cloud scales by count; single-tag reuses Featured/PostCard | tags/page.tsx §2.9, TagListingContent §2.10 | NEW (weighting + gradient h1) |
| 9 | No sort.ts/content changes; build passes | constraints §3 + §5 | enforced |
