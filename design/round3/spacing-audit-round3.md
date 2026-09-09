# Adroit Blog — WS-1: Site-Wide Spacing & Formatting Audit (Findings + Corrected Tokens)

**Task:** t_f1f7696b · **Author:** kara (designer) · **Date:** 2026-08-11
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Surface of the audit:** **Monitor** — this is a catalog of state, not a marketing brief. Findings are ranked by blast radius + severity so steel fixes the high-leverage tokens first, not the cosmetic stragglers.
**Audit scope:** every route — blog listing, post, learn hub, series, lesson, profile, settings, login, tags, categories. Grounded in actual `src/` files read this session.

---

## 1. Severity Key

| Level | Meaning | Count |
|---|---|---|
| 🔴 **High** | Visually broken rhythm on a public, high-traffic route; the seed issues Chris flagged | 4 |
| 🟠 **Med** | Inconsistent within a page/surface family; noticeable but not broken | 7 |
| 🟡 **Low** | Cosmetic drift between sibling components; worth normalising in the token pass | 9 |

---

## 2. 🔴 High — Findings

### H1. Progress-row vertical rhythm mismatch (the flagged seed)
The exact seed issue from the brief. Two progress presentations use different spacing conventions for the **same signal** (completion):

| Location | File | Spacing | Effective |
|---|---|---|---|
| Blog listing progress container | `src/components/Progress/BlogReadProgress.tsx:38,45` | `max-w-[1120px] mx-auto px-6 pt-5` | 20px top, 24px sides — sits on the page gutter, aligned to the grid |
| Learn-card user progress | `src/app/learn/page.tsx:87` | `mt-3 px-1` (wraps `SeriesProgress`) | 12px top, 4px sides — bleeds off the card's 22px body padding, misaligned with card text |
| SeriesProgress internal | `src/components/Progress/SeriesProgress.tsx` | renders a bare bar, no own container | relies on the caller's wrapper → inconsistent across call sites |

**Impact:** the blog progress bar aligns to the 24px gutter while the learn-card progress sits 4px off the card edge and 12px below the card — the two "your progress" signals don't share a rhythm, which is exactly the complaint.
**Fix (token):** one `--space-progress-block` (top) and one `--space-progress-inline` (inset). Blog listing uses the page-gutter variant; learn-card uses the card-inset variant. Both derived from the same scale so they read as one system.

### H2. Hero top padding variance across public routes
Every public route's hero uses a different `pt-*`:

| Route | File | Top pad |
|---|---|---|
| Blog listing | `src/app/blog/page.tsx:121` | `pt-12` |
| Learn hub | `src/app/learn/page.tsx:52` | `pt-14` |
| Tags index | `src/app/tags/page.tsx:38` | `pt-12` |
| Tag listing | `src/app/tags/[tag]/TagListingContent.tsx:27` | `pt-12` |
| Series syllabus | `src/app/learn/[series]/page.tsx:83` | `pt-9` |
| Article / lesson / exam / cert | `src/app/*/[slug]/page.tsx` etc. | `pt-10` |

**Impact:** as you move between `/blog` → `/learn` → a series → a lesson, the heading jumps up and down by up to 20px. The series page (`pt-9`, 36px) is the outlier — it sits below the header differently than its sibling surfaces.
**Fix (token):** one hero rhythm — `--space-hero-block` = 56px (`pt-14`) for public Explore/Decide-Learn heroes; `--space-hero-block-tight` = 40px (`pt-10`) for nested detail surfaces (lesson/exam/cert). Series syllabus uses the standard 56px.

### H3. Section-grid bottom padding drift
The main content section's closing padding varies by route:

| Route | File | Bottom |
|---|---|---|
| Learn hub | `src/app/learn/page.tsx:69` | `py-10 pb-24` |
| Blog listing | `src/app/blog/page.tsx:227` | `pb-10` |
| Categories | `src/app/blog/categories/page.tsx:126,188` | `py-8 pb-10` |
| Tags | `src/app/tags/page.tsx:52` | `pb-10` |

**Impact:** `/learn` clears the footer by 96px while `/blog` clears it by 40px — an inconsistent sense of "end of page" between the two primary browse surfaces.
**Fix (token):** standardise section closure to `--space-section-bottom` = 96px (`pb-24`) on Explore surfaces and 56px (`pb-14`) on nested detail surfaces. Root cause is two different "how far above the footer" values; collapse to two tokens.

### H4. Card body + progress row don't share a gutter
`PathCard` (`src/components/Learn/PathCard.tsx:43-68`) uses `p-[22px] pb-6` for the body and `mt-4 pt-3 border-t border-gray-100` for the progress row — while the *user* progress row on the hub (`learn/page.tsx:87`) is `mt-3 px-1`. The card's own internal rows use `mt-4`/`pt-3` but the hub-wrapped progress uses `mt-3`/`px-1`. Two different inset + rhythm values for progress rows on the same card family.
**Fix (token):** progress-row block rhythm `--space-row-sm` = 12px (mt-3) and `--space-row-md` = 16px (mt-4) shared by both; inline inset always matches the card body (`px-[22px]`), never `px-1`.

---

## 3. 🟠 Medium — Findings

### M1. Account shell padding vs content width
`/settings` (`page.tsx:42`) and `/profile` (`page.tsx:39`) both use `max-w-[560px] mx-auto px-6 py-14`. Consistent with each other ✅ — but the py-14 (56px) top differs from the 40-56px hero rhythm elsewhere. Minor, but the shell top should read `py-14` (it's a nested Configure surface, so `--space-hero-block-tight` doesn't apply — keep 56px, it's fine; **flag for verification only, no change**).

### M2. Section-header vertical rhythm (group headers on Learn + category rows)
`learn/page.tsx:72-79` group header: `flex items-center gap-3 mb-5` with a `w-6 h-6` count badge. `blog/categories` uses `py-8` sections. The mono-section-header language (`font-mono text-[11px] ... tracking`) is used on Learn, Settings, Profile with slightly different margins (`mb-5` on Learn, `mb-3` on account cards, `mb-7`/`mb-8` on page subs).
**Fix (token):** one `--space-heading-after` = 20px (`mb-5`) for all mono section headers; page-kicker to title stays `--space-gap-sm` = 8px.

### M3. Button/pill height drift
Primary CTAs are `px-[18px] py-2` (header Contact), `h-11 px-5` (GuestCTA), `h-11 px-5 rounded-xl` (login). The `py-2` header button is shorter than the `h-11` (44px) account CTAs. Not broken, but two button heights exist.
**Fix (token):** buttons are either `h-11` (44px, touch) or `h-9` (36px, compact). No in-between `py-2` heights. Header Contact → `h-9` compact; account/login/GuestCTA → `h-11`.

### M4. Article body vs lesson body container
Blog `[slug]/page.tsx` and lesson `[slug]/page.tsx` both use `max-w-[720px] article-body`. Good. But `learn/page.tsx:60` sub-description is `max-w-[560px]` while the hero heading itself is full-width — the blog listing (`blog/page.tsx:129`) also `max-w-[560px]`. Consistent ✅ — **no change**, logged as verified-good.

### M5. ProgressIndicator dual usage — label position
`ProgressIndicator` is the shared bar (used by BlogReadProgress, SeriesProgress). Its internal label/meta row spacing should be tokenised so the bar always sits `--space-row-sm` below its label, never hardcoded per-call-site.

### M6. Mark-as-read / read-state badges
Read-state check badge on PostCard sits top-right over the banner. The banner top-right is also where PathCard puts its `lessons-chip`. Same corner, different components — ensure consistent `--space-chip-gap` inset (currently `top-12 right-14` vs `top-12 right-14` — verify in execution; document the shared value).

### M7. `px-6` gutter on card grids vs `px-[22px]` card padding
All card grids use `px-6` (24px) page gutter; cards use `p-[22px]` body. These are intentionally different (page gutter vs card interior) but the 22 vs 24 difference is untokenised and easy to drift. Tokenise both: `--space-gutter-page` = 24px, `--space-card-pad` = 22px.

---

## 4. 🟡 Low — Findings

- **L1.** `ExamLocked.tsx:66` uses `px-1` on a row (same off-gutter `px-1` family as H4) — normalise to `px-3`/`px-[22px]`.
- **L2.** `CertReadiness.tsx:61` uses `mt-3` — should use `--space-row-sm` token.
- **L3.** `SeriesSyllabus.tsx:98` uses `border-t mt-3` — the progress-row pattern; normalise to shared token.
- **L4.** `tags/page.tsx:46` sub uses `mb-8` while sibling route subs use `mb-7` — collapse to `--space-heading-after`.
- **L5.** `learn/[series]/page.tsx:139` uses `py-8 pb-4` — inconsistent with M2's `py-8 pb-10`.
- **L6.** Reading progress bar (`globals.css .reading-progress`) is 3px; the card progress bars are `h-1.5` (6px). Two bar heights for "progress". Keep 3px for the top scroll bar (distinct purpose), tokenise `--space-bar-lg` = 6px for card bars, `--space-bar-xs` = 3px for scroll.
- **L7.** BlogReadProgress loading skeleton uses `h-1.5` — matches card bar height ✅ but sits in the page gutter where the real bar also is — fine, verified.
- **L8.** Card hover translate: PostCard `-translate-y-1` (4px) vs PathCard `-translate-y-[3px]` — two lift values. Collapse to `--elev-lift` = 4px for both.
- **L9.** `rounded-xl` (12px) cards vs `rounded-[20px]` account cards — intentional (account cards are more "panel"-like), but the 20px value should be a token `--radius-panel`.

---

## 5. Corrected Spacing Token Pass (what steel implements)

Add to `globals.css` `@theme inline`:

```css
/* ── WS-1: Spacing scale (4px base) ───────────────────────────── */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;    /* --space-row-sm */
--space-4: 16px;    /* --space-row-md */
--space-5: 20px;    /* --space-heading-after / progress-block */
--space-6: 24px;    /* --space-gutter-page */
--space-7: 28px;
--space-8: 32px;
--space-10: 40px;   /* --space-hero-block-tight */
--space-14: 56px;   /* --space-hero-block  */
--space-24: 96px;   /* --space-section-bottom */

/* Semantic aliases */
--space-gutter-page: var(--space-6);   /* 24px page gutter */
--space-card-pad: 22px;                /* card body inset (PathCard/PostCard) */
--space-row-sm: var(--space-3);        /* 12px — tight row rhythm (progress rows) */
--space-row-md: var(--space-4);        /* 16px — card-internal row rhythm */
--space-heading-after: var(--space-5); /* 20px — mono section header to content */
--space-hero-block: var(--space-14);   /* 56px — public Explore/Decide-Learn hero top */
--space-hero-block-tight: var(--space-10); /* 40px — nested detail hero top */
--space-section-bottom: var(--space-24);   /* 96px — Explore surface footer clearance */
--space-progress-block: var(--space-5);    /* 20px — standalone progress bar top (blog) */
--space-progress-inset: var(--space-3);    /* 12px — in-card progress bar top (learn) */
```

**Mapping steel applies per route:**

| Route | Apply |
|---|---|
| Blog listing progress (`BlogReadProgress`) | container `pt-[var(--space-progress-block)] px-[var(--space-gutter-page)]` |
| Learn-card progress (`learn/page.tsx:87`) | wrapper `mt-[var(--space-progress-inset)] px-[var(--space-card-pad)]` (was `mt-3 px-1`) |
| All public heroes | `pt-[var(--space-hero-block)]` (series `pt-9` → `pt-14`) |
| All nested detail heroes (lesson/exam/cert) | `pt-[var(--space-hero-block-tight)]` |
| Section closures | Explore: `pb-[var(--space-section-bottom)]`; detail: `pb-14` |
| Mono section headers (Learn/Settings/Profile) | `mb-[var(--space-heading-after)]` |
| Card grids | gutter `px-[var(--space-gutter-page)]`; card body `p-[var(--space-card-pad)]` |
| Card hover lift | unify to `-translate-y-[var(--elev-lift)]` where `--elev-lift: 4px` |
| Buttons | `h-11` touch / `h-9` compact only |

**`--elev-lift`** and **`--radius-panel`** (20px) added to the token file so L8/L9 have homes.

---

## 6. Acceptance Check (for zod)
1. Blog listing progress and learn-card progress use the same spacing scale (20px/24px gutter vs 12px/22px inset) — no more `pt-5` vs `mt-3 px-1` mismatch.
2. `/blog`, `/learn`, `/tags` heroes share `pt-14`; series hero no longer `pt-9`.
3. Learn hub clears footer by 96px, matching blog listing intent (`pb-24`).
4. All buttons are `h-11` or `h-9`; no stray `py-2` primary CTAs.
5. `npm run prebuild` unaffected (no content/build changes); `tsc` + tests pass.

---

*Companion files: `design-tokens-round3.css` (this doc + dark-mode + new tokens), `mockup-learn-hub-round3.html`, `mockup-settings-round3.html`, `mockup-profile-round3.html`, `design-system-round3.html`.*
