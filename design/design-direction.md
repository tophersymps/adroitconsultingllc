# Adroit Blog — Design Direction (Elevate, Don't Replace)

**Task:** t_e3c87690 · **Author:** kara (designer) · **Date:** 2026-08-05
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Status:** DESIGN ONLY — no code. Steel implements from this brief + mockups.

---

## 1. Surface Archetype (committed before tokens)

| Page | Surface | Why |
|---|---|---|
| `/blog` listing | **Explore** | Browsing cards, category filter, sort — glanceability drives the layout. Hero stays typographic, NOT a marketing hero+3-cards. |
| Post detail | **Decide/Learn** | Reading/learning surface — typography, measure, banner, share affordances are the whole job. |
| `/learn` hub | **Explore** | Browsing learning paths grouped by track; progress is the glanceable signal. |
| Categories / tags | **Explore** | Card grids + filter semantics. |

The existing navy/red palette, category gradients, rounded-xl cards, and Inter stack are **kept**. This is an evolution of surface treatment and typographic hierarchy — not a redesign.

## 2. The One-Line Direction

> **"Editorial polish with motion discipline"** — sharper typographic scale, real elevation on hover, category-tinted glow instead of flat borders, and a reading experience that feels like a crafted publication rather than a default Next.js blog.

## 3. Changes Per Page / Component (what + why)

### 3.1 Global (globals.css / design tokens)
- **Elevation tokens:** add `shadow-card` (resting: subtle navy-tinted border + soft shadow) and `shadow-card-hover` (lift: `0 12px 32px -12px rgba(11,29,58,0.25)` + `-translate-y-1`). Cards should *lift*, not just darken.
- **Focus-visible ring** in red (`outline: 2px solid var(--color-red); outline-offset: 2px`) — a11y win, currently missing.
- **Hero glow:** `.hero-glow::before/::after` — two soft radial glows (red + sky) behind hero headlines. From the earlier exploratory stash; keep it *very* subtle (`0.08–0.10` alpha), never a blob.
- **Link underline:** article-body links get `text-decoration-color: rgba(200,16,46,0.4)` with `text-underline-offset: 4px`, thickening to full red on hover. (From stash direction — good, keep.)
- **Hover motion discipline:** all interactive cards use `duration-200`/`duration-300` + `ease-out`; `prefers-reduced-motion` respected.

### 3.2 Blog listing (`/blog`)
| Element | Change | Why |
|---|---|---|
| Hero | Add mono kicker row (red dot + `ADROIT CONSULTING — FIELD NOTES`), gradient display headline (navy→navy-light, `bg-clip-text`), hero-glow behind | Mirrors the already-good `/learn` hero; gives the listing a designed entrance without a stock photo |
| RSS link | Pill treatment with hover → red | Small craft detail, consistent with new language |
| Category pills | Keep navy active; add subtle shadow on active + red underline indicator; hover border→navy | Clarifies selection state, adds depth |
| **FeaturedPost** | Add category-tinted radial glow inside navy panel, image zoom on hover (`group-hover:scale-[1.03]`), "Featured" pill with pulsing red dot, title up to `md:text-3xl`, "Read article →" arrow that slides | The single most-seen element on the blog; it must feel *premium* |
| **PostCard** | Hover: `-translate-y-1` + `shadow-card-hover` + `border-navy/15`; banner image zoom on hover; title `text-lg` tracking-tight; date/readTime row in mono; "Read more →" slides on hover | "Card grid elevation" is the #1 ask — lift + zoom + arrow slide reads as designed, not flat |
| Pagination | Active page gets navy + shadow + red top indicator | Consistency with selection language |

### 3.3 Post detail
| Element | Change | Why |
|---|---|---|
| Article body type | Body `1.125rem` / `line-height: 1.8`; h2 → `1.5rem` extrabold navy with bottom hairline; h3 → `1.125rem` bold; lists & blockquotes refined | Reading experience is the whole surface — larger type + air = crafted publication feel |
| Links | Red underline decoration (see 3.1) | Consistent editorial link language |
| Blockquote | Red 3px left border, `gray-50` bg, rounded-r, larger padding | Softer, more designed than current flat rule |
| **Banner** | Taller (`h-[380px]` desktop), `rounded-2xl`, bottom gradient overlay for depth, category chip overlay top-left | Banner treatment is called out in scope — add depth + label |
| **ShareBar** | Replace text glyphs (𝕏 / in / f) with inline SVG icons in circular buttons; copy button shows ✓ state; hover navy→red | Current glyphs look default; real icons = designed |
| Author row | Avatar `rounded-xl` (not full circle) + red ring on hover | Subtle signature detail |
| Tags | Pill hover → navy text | Consistency |
| Reading progress bar | Keep red fill, add subtle glow under fill | Already good — small polish |

### 3.4 Learn hub (`/learn`)
| Element | Change | Why |
|---|---|---|
| Hero | Add hero-glow behind "Learn" display; keep gradient text | Matches new listing hero language |
| Section headers | Mono uppercase + red tick + lesson-count badge + hairline rule | Grouped sections feel curated, not listy |
| **PathCard** | Gradient band: add subtle radial glow + pattern, taller (`h-[140px]`), series label chip refined; hover: lift + shadow-xl + band scale; body: title `text-xl`→`tracking-tight`, description clamp-2, **progress row more prominent** (mono counter in navy) | Progress presentation is in scope — the "Lesson N of M" bar is the signature Learn component, give it room |
| "Coming soon" | Badge refined with dashed border | Empty state polish |

### 3.5 LessonCard (series page)
- Sequence badge: `rounded-xl`, red lesson number on navy (red accent = the "current" reading signal)
- Hover: bg `gray-50` → `navy/[0.03]` tint + arrow slides right
- "New" badge: keep red pill, add pulse dot

### 3.6 Categories page
- Category cards: consistent hover lift + shadow; icon in tinted rounded chip; post count as mono pill
- Subscribe CTA: navy panel + red radial glow + red button hover `red-dark`; input focus ring red (already present)

### 3.7 Tags pages
- Hero mirrors listing hero (kicker + gradient headline)
- Post cards use the elevated PostCard (shared component = free consistency)

## 4. What Stays EXACTLY the Same (do not touch)
- `src/lib/sort.ts`, sort logic, bannerImage rendering logic, build scripts, `content/`
- Component *structure* — only className/tailwind patterns change
- Navy `#0B1D3A` / red `#C8102E` palette, category gradients, Inter, rounded-xl

## 5. Motion & Interaction Notes (for steel)
- All hovers: `transition-all duration-200 ease-out` (cards `duration-300`)
- Featured image zoom: `group-hover:scale-[1.03]` with `duration-500 ease-out`
- "Read more →" / "Read article →": arrow `translate-x` on group-hover
- Live pulse: featured "Featured" dot — `animate-pulse` (respect reduced motion)
- Respect `prefers-reduced-motion: reduce` — disable transforms/zooms

## 6. Handoff Files
- `design/design-tokens.css` — tokens + utility patterns for steel
- `design/mockup-blog-listing.html` — elevated `/blog` (desktop)
- `design/mockup-post-detail.html` — elevated post detail
- `design/mockup-learn-hub.html` — elevated `/learn`
- `design/mockup-categories.html` — elevated `/blog/categories`
- `design/mockup-tags.html` — elevated `/tags` index + `/tags/[tag]` listing
- `design/design-system.html` — full design system report w/ screenshots
- `design/screenshots/*.png` — browser-verified captures

## 7. Acceptance Criteria (for zod/QA)
1. PostCard lifts on hover (`-translate-y-1` + shadow) and banner image zooms — no flat hover
2. FeaturedPost has category glow + image zoom + pulsing Featured dot
3. Article body ≥1.125rem, line-height ≥1.75, h2 has bottom hairline, links have red underline decoration
4. ShareBar uses SVG icons, copy button shows ✓ state
5. Learn PathCard progress row is prominent; section headers have count badges
6. Focus-visible red ring on all interactive elements (keyboard a11y)
7. Category cards use photographic bands (tinted per category) + icon chip, lift + category-tinted glow on hover
8. Tag cloud chips scale by post count; single-tag pages reuse elevated FeaturedPost + PostCard for consistency
9. No src/lib/sort.ts or content/ changes; build passes
