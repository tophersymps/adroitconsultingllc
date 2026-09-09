# Draft-State Implementation Architecture — Adroit Blog

**Task:** t_65f88d8f · **Author:** Brainiac (web architect) · **Date:** 2026-08-13
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog` (tenant: adroit-blog)
**Sources read:** `requirements/draft-state.md` (Lois BA v1.0), `design/discovery/direction-brief-draft-preview.md` (Kara discovery t_add78bba), `design/discovery/design-tokens-draft-preview.css` + `design/design-system-draft-preview.html` (Kara execution t_417a1026), and the live codebase (`src/data/types.ts`, `src/data/posts.ts`, `src/data/learn.ts`, `scripts/build-posts.js`, `scripts/build-learn.js`, `src/lib/mdx.ts`, `src/lib/learn.ts`, `src/lib/supabase/server.ts`, `src/app/blog/[slug]/page.tsx`, `src/app/learn/[series]/[slug]/page.tsx`, `src/app/sitemap.ts`, `src/app/feed.xml/route.ts`, `src/lib/feed.ts`, `src/app/robots.ts`, `src/app/login/page.tsx`, `src/app/api/auth/session/route.ts`, `src/lib/redirect.ts`, `next.config.ts`).
**Design deliverable is FINAL** (parent t_417a1026 complete); this doc turns it into an implementation plan for Steel.

---

## 1. Stack

Next.js 16 App Router (TypeScript) on Vercel, Supabase SSR auth, static MDX content piped through `next-mdx-remote/rsc`. The site is SSG except the already-dynamic lesson pages (`export const dynamic = "force-dynamic"` in `src/app/learn/[series]/[slug]/page.tsx`). The draft feature adds **one new dynamic surface** (`/preview/*`) and otherwise leaves the static pipeline untouched.

The architecture is deliberately boring and reuses the shipped pipeline:
- **Filtering at generation time** (build scripts) is the single source of truth — every downstream consumer already reads `posts`/`learn` data.
- **Preview at request time** reuses the existing MDX read helpers (`getMDXContent`, `getLearnMDXContent`) which already `fs.readFileSync` from `content/` — exactly what a dynamic preview route needs.
- **Auth reuses the existing Supabase SSR cookie client** (`getSupabaseServerClient()`) — no new auth infra, no roles table, matching the BA constraint.

No new dependencies. No new API routes required.

---

## 2. Data & API Contract

### 2.1 Status field

Add an optional `status` field to both interfaces in `src/data/types.ts`. Optional + default `published` = backward compatible (existing MDX has no `status`, stays published).

```ts
// src/data/types.ts
export interface BlogPost {
  // ...existing fields
  /** Optional draft flag: "draft" is excluded from public build data. Default "published". */
  status?: "draft" | "published";
}

export interface LearnLesson {
  // ...existing fields
  status?: "draft" | "published";
}
```

**Frontmatter contract:** `status: draft` (or `published`). Absent → `published`.

### 2.2 Build-time filtering (the single source of truth)

Both build scripts parse frontmatter with an internal `parseFrontmatter()` (near-identical copies). Add a `status` read and **skip drafts** in the generated arrays. The generated data file gains a `status` field so the preview/other tooling can read it.

**`scripts/build-posts.js`** — in the per-file loop, after `const [fm] = parseFrontmatter(raw)`:
```js
const status = fm.status === "draft" ? "draft" : "published";
if (status === "draft") { console.log(`Skipping draft: ${file}`); continue; }
posts.push({ slug, title, excerpt, category, /* ... */ status, });
```
Output shape change: `BlogPost[]` now includes `status: "published"` on every row (additive, no consumer breaks).

**`scripts/build-learn.js`** — in `buildSeries()`'s per-lesson loop, the same `status` read + `continue` for drafts, and add `status` to the pushed lesson object. Two consequences to verify at build time:
- The **series object itself is always emitted** (dir-driven, not lesson-driven), so a series whose lessons are *all* drafts still renders with `lessons: []` and `totalLessons: 0` → the existing graceful "coming soon" state (BA open question 5 default). This is acceptable and requires no code.
- The **flat `learnLessons` array** is `series.flatMap(s => s.lessons)`, so filtering in `buildSeries` automatically excludes drafts from the flat array too. No second filter needed.

**Downstream exclusion is automatic** — confirmed by reading the consumers, all of which read from generated data:
| Surface | Consumer | Draft handling |
|---|---|---|
| `/blog` listing | `src/app/blog/page.tsx` → `@/data/posts` | auto-excluded |
| `/blog/categories` | `categories/page.tsx` → `posts` | auto-excluded |
| `/blog/[slug]` | `generateStaticParams()` filters `getAllMDXSlugs()` against `posts` | **draft 404s** — confirmed, the `.filter((slug) => posts.some(...))` already drops anything not in `posts` |
| `/learn` hub | `LearnHub`/`LearnFilters` → `learnSeries` | auto-excluded |
| `/learn/[series]` | `getSeriesBySlug` → `learnSeries[].lessons` | auto-excluded |
| `/learn/[series]/[slug]` | `generateStaticParams()` via `learnLessons` | draft 404s |
| `sitemap.ts` | imports `posts`, `learnLessons`, `learnSeries` | auto-excluded |
| `feed.xml` | `generateFeedXml()` imports `posts` | auto-excluded |
| tags / featured / related | derived from `posts` | auto-excluded |
| `getAllCanonicalLessonSlugs()` (completion security) | reads **questions/** JSON dirs, not MDX status | unaffected (correct) |

**No changes to sitemap.ts, feed.ts, tags, or any page component.** This is the whole point of the build-time filter.

### 2.3 API plan

**No new API routes.** The preview gate is enforced entirely in a server component via the existing `getSupabaseServerClient()` cookie client — the same pattern `src/app/learn/[series]/[slug]/page.tsx` already uses for its guest gate (ADR-104). The client-side `/api/auth/session` route is NOT the enforcement point; it's informational only.

The one optional additive is a small server helper (not a route) to centralize allowlist logic so the two preview pages share it.

---

## 3. Preview Route Design

### 3.1 Route table (recommended)

The BA's flat `/preview/[kind]/[slug]` doesn't fit Learn, which needs two segments (`series` + `slug`). Recommend **two concrete route dirs** — the `kind` is implicit in the folder, which is cleaner than a `[kind]` param branch:

| Route | Segment shape | Reads | Renders |
|---|---|---|---|
| `/preview/blog/[slug]` | `src/app/preview/blog/[slug]/page.tsx` | `getMDXContent(slug)` → `content/blog/[slug].mdx` | blog renderer (blog `MDXArticle`) |
| `/preview/learn/[series]/[slug]` | `src/app/preview/learn/[series]/[slug]/page.tsx` | `getLearnMDXContent(series, slug)` → `content/learn/<series>/[slug].mdx` | learn renderer (learn `MDXArticle`) |

Rejected alternatives:
- `/preview/[kind]/[slug]` — cannot express Learn's two-segment path without a divergent nested param; creates awkward branching.
- `/drafts/...` — reserves the `/drafts` route name for the (out-of-scope) index; `/preview/` is unambiguously a preview namespace and matches the design brief.

**Dynamic requirement:** `export const dynamic = "force-dynamic"` on both pages (reads cookies via `getSupabaseServerClient` + reads `content/` via `fs` → must not be statically optimized). This mirrors the existing lesson page.

### 3.2 MDX read + render reuse

Both existing helpers already read `content/` at request time via `process.cwd()` — the preview route needs **zero new file-reading logic**:
- Blog: `getMDXContent(slug)` + `stripMDXFrontmatter` + `linkifySourceCitations` (from `src/lib/mdx.ts`) → blog `MDXArticle`.
- Learn: `getLearnMDXContent(series, slug)` + `stripMDXFrontmatter` + `linkifySourceCitations` (from `src/lib/learn.ts` + `mdx.ts`) → learn `MDXArticle`.

**Refactor for single source of truth:** both `src/app/blog/[slug]/page.tsx` and `src/app/learn/[series]/[slug]/page.tsx` currently define a private `MDXArticle` function (~50 near-identical lines each). **Extract it into a shared server component** `src/components/MDX/MDXArticle.tsx` and have both public pages *and* the two preview pages import it. This removes existing duplication and gives preview pixel-identical rendering by construction. The public pages change only by import swap (identical output) — a safe, build-verified refactor. (If Steel prefers zero public diff, duplicating the renderer in the preview pages is acceptable, but extraction is the better long-term choice and is recommended.)

### 3.3 Auth gate (server-side only)

Use the existing Supabase SSR cookie client + a `PREVIEW_ALLOWED_EMAILS` allowlist:

```
getSupabaseServerClient().auth.getUser()
  → user null?        → DraftLocked state="signed-out"   (200, locked card, CTA → /login?next=<full path>)
  → user not allowed  → DraftLocked state="no-access"    (200, BA copy "This content is not yet available", mailto)
  → user allowed      → render PreviewStrip + MDXArticle (200, with DRAFT strip)
```

- **Allowlist source:** env var `PREVIEW_ALLOWED_EMAILS` (comma-separated, lowercase-trimmed). Recommend the env var (matches BA §Auth Gate Design, simpler than a table, no deploy-per-editor concern for a 2-person team). Fall back to a server constant if unset. Recommend **lowercase normalization on both sides** (`user.email?.toLowerCase()` vs normalized list) to avoid case mismatch.
- **New helper** `src/lib/preview-auth.ts`: `export function isPreviewEmailAllowed(email: string | undefined): boolean` reading + parsing the env once per module load.
- **No redirect for guests** — render the locked card at 200 (design brief §5 recommendation, satisfies the BA's "login prompt" branch). The server-side check is what blocks content; guests never receive MDX bytes.
- **`next` param safety:** the login CTA uses `/login?next=<encodeURIComponent(pathname)>` — reuse `sanitizeRedirectPath` (already imported on the login page) so the echo-back is safe (CWE-601, existing pattern).

### 3.4 Vercel function filesystem (critical)

The `/preview/*` routes read `content/*.mdx` at request time, but Vercel serverless functions only bundle files traced at build time. Add `outputFileTracingIncludes` to `next.config.ts` (verified present in Next 16 docs, keys are picomatch route globs, values are globs resolved from project root):

```ts
outputFileTracingIncludes: {
  "/preview/blog/[slug]": ["./content/blog/**/*.mdx"],
  "/preview/learn/[series]/[slug]": ["./content/learn/**/*.mdx"],
},
```

Without this the preview routes deploy but return empty content (files missing from the function bundle). This is the single most likely silent-failure point — **must be verified in a real Vercel deploy, not just `next build` locally** (local build traces into `.next`; the include only matters for the serverless bundle).

### 3.5 robots.txt

`src/app/robots.ts` currently `disallow: ['/api/']`. Add `'/preview/'` so crawlers don't index drafts. (sitemap.ts does not need editing — it never referenced `/preview`.)

---

## 4. Component Map

### Reuse as-is (zero new code)
`Header`, `Footer`, `ReadingProgress`, `BackLink`, `Tag`, `BannerImage`, `GuestCTA` **pattern** (the lock-card anatomy), `EmptyState` **pattern** (only if `/drafts` index ships).

### Shared MDX renderer (extracted refactor)
`src/components/MDX/MDXArticle.tsx` — extracted from the two public pages; props `{ mdx: string, kind: "blog" | "learn" }` (or two thin wrappers). Uses `next-mdx-remote/rsc` + `remark-gfm` (+ the footnote-rename rehype plugin for blog).

### New components (from Kara's design brief — small, Steel builds from spec)
| Component | Props | States | Semantics |
|---|---|---|---|
| `DraftBadge` | `status: "draft" \| "published"` | amber pill + pulsing dot / emerald pill | `span role="status"`, dot `aria-hidden` |
| `PreviewStrip` | `{ title, status, backHref }` | above-article band, dark remap | `div role="region" aria-label="Draft preview notice"` placed BEFORE `<article>`, never inside |
| `DraftLocked` | `state: "signed-out" \| "no-access"`, `nextPath?` | 2 copy tiers | `section aria-label="Preview locked"`, real `<a>` to `/login?next=` or `mailto:` |

### New tokens (3 additive aliases — globals.css `@theme inline` + `html.dark`)
From `design/discovery/design-tokens-draft-preview.css`:
```css
@theme inline { --signal-draft-bg: var(--signal-warn-bg); --signal-draft-text: var(--color-amber-700); --border-draft: var(--color-amber); }
html.dark { --signal-draft-bg: rgba(245,158,11,0.14); --signal-draft-text: var(--accent-hover); --border-draft: rgba(245,158,11,0.45); }
```
No new colors, fonts, or deps. Motion auto-covered by the existing `prefers-reduced-motion` block.

### Preview page composition (both routes)
```
ReadingProgress + Header
  <PreviewStrip title status backHref />        ← full-width amber band above article
  <main>
    author row / Tag / title / tags / banner    ← verbatim, same as public
    (NO ShareBar, NO progress widgets, NO Featured pill, NO GuestCTA, NO LessonQuiz)
    <article class="article-body">
      <MDXArticle mdx={mdxBody} />
    </article>
  </main>
Footer
```

---

## 5. Diagram

```mermaid
flowchart LR
  subgraph Repo["Repo content + build"]
    MDX["content/*.mdx<br/>status: draft|published"]
    BP["build-posts.js"]
    BL["build-learn.js"]
    DATA["src/data/*.ts<br/>generated (drafts excluded)"]
  end

  subgraph Public["Public SSG surface"]
    BLOG["/blog, /blog/[slug],<br/>categories, tags, featured"]
    LEARN["/learn, /learn/[series],<br/>/learn/[series]/[slug]"]
    SEO["sitemap.ts · feed.xml · robots"]
  end

  subgraph Preview["Dynamic preview (request-time)"]
    GATE{"getSupabaseServerClient()<br/>+ PREVIEW_ALLOWED_EMAILS"}
    LOCKED["DraftLocked<br/>signed-out | no-access"]
    STRIP["PreviewStrip + MDXArticle"]
  end

  MDX --> BP
  MDX --> BL
  BP --> DATA
  BL --> DATA
  DATA --> BLOG
  DATA --> LEARN
  DATA --> SEO

  MDX -.fs.readFileSync.-> STRIP
  GATE -->|guest / not allowed| LOCKED
  GATE -->|allowlisted| STRIP
```

---

## 6. Files Touched

| File | Action |
|---|---|
| `src/data/types.ts` | add `status?` to `BlogPost` + `LearnLesson` |
| `scripts/build-posts.js` | read + skip drafts, emit `status` |
| `scripts/build-learn.js` | read + skip drafts (per lesson), emit `status` |
| `src/lib/preview-auth.ts` | **NEW** allowlist helper |
| `src/components/MDX/MDXArticle.tsx` | **NEW** shared renderer (extracted) |
| `src/components/Preview/DraftBadge.tsx` | **NEW** |
| `src/components/Preview/PreviewStrip.tsx` | **NEW** |
| `src/components/Preview/DraftLocked.tsx` | **NEW** |
| `src/app/preview/blog/[slug]/page.tsx` | **NEW** |
| `src/app/preview/learn/[series]/[slug]/page.tsx` | **NEW** |
| `src/app/globals.css` | add 3 draft tokens (`@theme inline` + `html.dark`) |
| `next.config.ts` | add `outputFileTracingIncludes` |
| `src/app/robots.ts` | `disallow: ['/api/', '/preview/']` |
| `.env.local` | add `PREVIEW_ALLOWED_EMAILS` (not committed; add to `.env.example` if one exists) |
| `src/app/blog/[slug]/page.tsx` | refactor `MDXArticle` → shared import (output-identical) |
| `src/app/learn/[series]/[slug]/page.tsx` | refactor `MDXArticle` → shared import (output-identical) |

**Not touched:** `sitemap.ts`, `feed.ts`, `src/app/blog/page.tsx`, `src/app/learn/page.tsx`, category/tag pages, `GuestCTA`, published `content/` files, `src/lib/sort.ts`, `src/lib/learn-card.ts`.

---

## 7. Flip-Flow Contract (draft → published)

Documented for Perry's editorial cron (no cron changes in this task):
1. Cron reads the MDX frontmatter of a draft post/lesson.
2. On review PASS: edit `status: draft` → `status: published` in the frontmatter; write the file.
3. Commit + push. Vercel auto-deploys; the `prebuild` step (`node scripts/build-posts.js && node scripts/build-learn.js`) regenerates `posts.ts`/`learn.ts`, now including the item.
4. Item appears on public pages / sitemap / feed on that deploy. No manual UI.

The **status field is the single control for visibility.** Flip is a file edit + commit, never a runtime toggle.

---

## 8. Build Decomposition (for the board)

The feature splits cleanly into **two Steel tasks** — the first is build-filtering + types (self-contained, testable independently), the second is the preview route + auth (depends on the status field existing but not on the first task's output). They can run sequentially on the same board:

### Task A — Status field + build filtering (Steel)
**Acceptance criteria (map to US-001, US-005):**
1. `BlogPost` + `LearnLesson` have optional `status?: "draft" | "published"`.
2. A `content/blog/x.mdx` with `status: draft` is absent from `src/data/posts.ts` after `node scripts/build-posts.js`.
3. A `content/learn/<s>/y.mdx` with `status: draft` is absent from BOTH `learnSeries[].lessons` and `learnLessons` after `node scripts/build-learn.js`.
4. Existing content with no `status` field still appears (count unchanged — US-005).
5. `npm run build` passes; a draft is 404 on `/blog/[slug]` and `/learn/[series]/[slug]`.
6. Drafts absent from `sitemap.xml` and `feed.xml` output.

### Task B — Preview route + auth (Steel)
**Acceptance criteria (map to US-002, US-004):**
1. `/preview/blog/[slug]` and `/preview/learn/[series]/[slug]` exist, `force-dynamic`, read the raw MDX at request time, render with the same MDX renderer.
2. Guest visiting `/preview/...` sees the DraftLocked "signed-out" card at 200 with a `/login?next=` CTA — **no MDX bytes in the HTML** (verify with curl/view-source).
3. Signed-in, non-allowlisted email → DraftLocked "no-access" card, BA copy.
4. Signed-in, allowlisted (`PREVIEW_ALLOWED_EMAILS`) → PreviewStrip amber band + rendered article with DRAFT badge; ShareBar/progress/quiz/Featured all absent.
5. Public `/blog/[slug]` for a draft still 404s; public site visually unchanged (screenshot diff).
6. `robots.txt` disallows `/preview/`; sitemap doesn't include it.
7. **Vercel-deploy check:** after deploy, a preview URL returns full content (proves `outputFileTracingIncludes` works — the silent-failure risk).

---

## 9. Acceptance Criteria (feature-level, for Zod/QA)

- **US-001 (public never sees drafts):** verified via generated data + sitemap/feed 404s (Task A criteria 2-6).
- **US-002 (editors preview drafts):** allowlisted editor renders draft with DRAFT strip, same renderer, banner (Task B criteria 2,4).
- **US-003 (flip):** changing frontmatter draft→published + push includes it on next build (contract §7; QA can simulate by editing a fixture and rebuilding).
- **US-004 (guests blocked):** guest gets locked card, no MDX in HTML; authed-not-allowed gets no-access card; public URL 404s (Task B criteria 2,3,5).
- **US-005 (backward compat):** no-`status` content count unchanged (Task A criterion 4).

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Vercel function misses `content/*.mdx`** → preview renders empty | **High** | `outputFileTracingIncludes` + mandatory real-deploy verification (criterion 7). Easiest silent failure. |
| Draft leaking to public if a consumer bypasses generated data | Med | All consumers verified to read generated data only; the preview route is the only `fs`-reader and it's gated. `getAllMDXSlugs`/`getAllLearnMDXSlugs` are only called inside public `generateStaticParams` which cross-check against generated arrays — draft still 404s. |
| Allowlist case-mismatch locks out an editor | Med | Normalize both sides to lowercase. |
| Public page refactor (MDXArticle extraction) introduces a regression | Low | Output-identical import swap; covered by existing build + any screenshot diff. |
| Series with all-draft lessons renders as "coming soon" with 0 lessons | Low | Accepted (BA open question 5 default); visible-but-empty beats hidden series. |
| Env var not set in prod → nobody can preview (allowlist empty) | Med | Server-constant fallback + `.env.example` documentation; flag to Chris. |

---

## 11. Open Items for Chris (deferred decisions, do NOT block)

1. `PREVIEW_ALLOWED_EMAILS` env var (recommended) vs Supabase table — BA open Q1. Env var chosen; flag if editors change often.
2. `/drafts` index page — BA open Q3, out of scope. Design brief recommends it as a future additive; **not built here**.
3. Series-with-all-drafts "coming soon" behavior — BA open Q5; accepted as-is.

None of these block the two Steel tasks. Tasks can proceed under the env-var + no-index assumptions.
