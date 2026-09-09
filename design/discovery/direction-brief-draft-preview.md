# Adroit Blog — Design Discovery: Draft-State Preview UX

**Task:** t_add78bba · **Author:** kara (designer) · **Date:** 2026-08-13
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Parent (context):** t_d9c1e3d3 · **Child (execution):** t_417a1026 (currently blocked, waiting on this brief)
**Type:** DISCOVERY — direction + tokens + component inventory. The EXECUTION task (t_417a1026) composes the mockups from this brief. No code.

---

## 0. What This Discovery Covers

A **small, focused internal feature**: Chris (the author) needs to preview a draft post the way a reader will see it — before it's published. The preview surface matters; **the public site must be UNCHANGED**.

Four scope questions, answered here:

1. **Preview page UX** — how a draft renders for Chris (badge, banner, layout, back link)
2. **Draft listing** — does Chris need a `/drafts` index, or is a direct `/preview/<slug>` link enough?
3. **Auth-gate visual** — what an unauthenticated or non-allowlisted visitor sees
4. **State model** — status badge (DRAFT vs PUBLISHED) + review stage

**Data surface (verified 2026-08-13):** `BlogPost` (`src/data/types.ts`) has **no status/draft field**. `src/data/posts.ts` is **generated** from MDX frontmatter by `scripts/build-posts.js` — any `.mdx` file in `content/blog/` with valid frontmatter becomes a public post. There is **no `content/drafts/` dir**, no allowlist mechanism, and auth is a single binary (`useAuth` returns `{ user: {id, email} | null }` via the HttpOnly session cookie). Every design below is grounded in that reality; the mechanics section (§7) names the minimal seam steel needs.

**Governing spec (read first):** `requirements/draft-state.md` (Lois, BA, v1.0). This brief is the **visual layer** for that spec and aligns with its contracts:
- Status field is **binary**: `status: draft | published` (default `published`), applies to BOTH `content/blog/*.mdx` and `content/learn/<series>/*.mdx`.
- Preview route pattern is **`/preview/[kind]/[slug]`**: `/preview/blog/[slug]` and `/preview/learn/[series]/[slug]`.
- Allowlist is **`PREVIEW_ALLOWED_EMAILS`** env var, checked server-side.
- The `/drafts` index is currently **OUT of the BA's scope** (open question #3 for Chris) — this brief recommends it as an optional additive (§4) but the core preview feature must not depend on it.

**Builds ON the shipped design pass** (t_e3c87690 + t_7e4e4898 + dark mode t_f1f7696b): navy `#0B1D3A` / red `#C8102E` accent / off-white `#F7F8FA`, Inter + mono stack, semantic tokens (`--surface-*`, `--ink-*`, `--border-*`, `--accent`, `--signal-done` emerald, `--signal-warn` amber), mono kicker language (red dot + uppercase tracking), `shadow-card`, red focus-visible ring, `prefers-reduced-motion`. Nothing from those passes is redone.

---

## 1. Surface Archetypes (committed before tokens)

| Surface | Archetype | Why |
|---|---|---|
| `/preview/[kind]/[slug]` (blog + learn) | **Decide/Learn** (reading) + a thin **Command/Inspect** chrome | The preview IS the article reading surface — the whole point is "render exactly like the public page." The status chrome is an inspect rail: it tells Chris "you are looking at a draft, here's its state." Primary = Decide/Learn; the chrome is a removable overlay, never a redesign of the article. |
| `/drafts` index (optional, out of BA scope) | **Operate** | A queue of pending work with status per row. No hero, no cards-with-icons, no marketing framing — glanceable rows, one action each (open preview). |

The hero-plus-cards composition is **wrong** for both. The preview inherits the article's 720px column verbatim; the index is a list, not a grid.

---

## 2. The One-Line Direction

> **"The seam, not the redesign."** A draft renders pixel-identical to the published article — same 720px column, same MDXArticle, same banner, same typography — with ONE clearly-marked status strip above it that reads as an authoring rail. Chris reviews the actual surface he's about to ship; he never looks at a mock of it. The public site is untouched because the preview is a separate route that reuses the same renderer.

Visual vocabulary for the chrome (all from the existing system, nothing invented):
- **Amber** (`--signal-warn` #F59E0B + `--signal-warn-bg` #FEF3C7) = "not final / pending" — the repo already uses amber for "Coming soon" (StubBadge) and warnings. Red stays the error/accent; a draft is not an error.
- **Emerald** (`--signal-done`) = published / done — already the completion signal.
- **Mono kicker** (uppercase + tracking + dot) = the authoring voice, identical to GuestCTA/login kickers.
- **Dashed border** = "provisional" — the one new visual habit, and it's cheap (border-dashed exists in Tailwind).

---

## 3. Preview Page UX (`/preview/[kind]/[slug]`)

### 3.1 The rule: article renders 1:1 with the public page

The preview shell is the host page **minus the reader-only affordances**, nothing else. Applies to BOTH kinds — blog (`/preview/blog/[slug]` → blog renderer) and learn (`/preview/learn/[series]/[slug]` → lesson renderer):

| Public element | On preview? | Why |
|---|---|---|
| Header, Footer, ReadingProgress | ✅ Keep | Reviewing a 10-min draft benefits from the progress bar; header keeps context |
| BackLink (`/blog` or series) | ✅ Keep; retarget to `/drafts` **only if §4 index ships** — otherwise keep the public target | Back-to-blog is the natural exit when there's no queue |
| Author row, category Tag, title, tags, banner | ✅ Keep verbatim | This IS what readers see |
| `ShareBar` | ❌ Suppress | A draft must not be shareable (and the URLs would leak) |
| `PostReadProgress` / `MarkAsRead` (blog), `LessonCompleteProgress` / `MarkComplete` / `LessonQuiz` (learn) | ❌ Suppress | Progress/quizzes are for published content; a draft is not in the read model and must not accept answers |
| `GuestCTA` (learn) | ❌ Suppress | The draft IS the gated content — no second gate inside it |
| "Featured" pulse pill | ❌ Suppress | Drafts are never featured |

### 3.2 The status strip (the whole feature visually)

A full-width strip sitting **above the article column** (`max-w-[1120px]`, matching the header gutter), not inside the 720px article. It is a separate visual band so a screenshot of the article body never shows it.

```
┌────────────────────────────────────────────────────────┐
│ ● DRAFT                        [← Back to Blog]        │
│  Title: "Serving LLMs on K8s…"  Not yet published.     │
└────────────────────────────────────────────────────────┘
  (article renders below, exactly as public)
```

- **Background:** `--signal-warn-bg` (#FEF3C7 light; `rgba(245,158,11,0.14)` dark) — amber tint, full-width band, `border-b border-dashed` with an amber-tinged border.
- **Kicker row:** mono, `text-[11px]` uppercase, amber dot + `DRAFT` label — mirrors the GuestCTA kicker anatomy. The dot pulses (it is "live" — content that will change); the pill label stays `DRAFT` per the binary status contract.
- **Title row:** the post title, `text-sm font-semibold` in `--ink-primary`.
- **Message:** "Not yet published — this preview is only visible to you." in `--ink-muted`.
- **Back link:** reuse the BackLink anatomy (`← Back to Blog`, or `← Back to Drafts` if §4 ships), right-aligned on desktop, stacked on mobile.
- **Not sticky.** The ReadingProgress bar already owns the sticky top edge; a second sticky element would stack and fight it.

### 3.3 Draft badge

A mono pill that accompanies the status strip kicker (and can be reused in the index rows and anywhere a status needs showing):

- `DRAFT` — amber: `bg-amber-light text-amber-700` (same ratio as Tag's amber pair, AA-clears), `border border-dashed`, mono `text-[0.65rem] font-bold uppercase tracking-wider`.
- `PUBLISHED` — emerald: `bg-emerald-light text-emerald-700` (reuse `--signal-done-bg`). Rendered only on index rows / status indicators, never on the preview strip itself (a published item doesn't preview).

No new colors. The pill is `Tag`-shaped (rounded-full, px-2 py-0.5) so it reads as part of the existing badge family.

---

## 4. Draft Listing — RECOMMENDED, but currently OUT of BA scope

**Recommendation: yes, a `/drafts` index — but minimal.** A direct `/preview/<slug>` link is not enough: Chris needs to see *all* pending drafts and their stage at a glance, and a link per draft (bookmarked or pasted) has zero discoverability. However, the BA's `requirements/draft-state.md` v1.0 **explicitly lists the draft index as out of scope** (open question #3 for Chris), so this is an **optional additive** — the core preview feature must ship without it. If Chris says yes, this is the design:

- Single column of rows (no cards, no icons, no hover glow) — `max-w-[720px]` or a slightly wider 820px table-like list.
- Each row: title (`font-semibold`, links to `/preview/<slug>`), category tag (reuse `Tag`), the **status pill** (§3.3), and a mono date/updated line. Hairline `border-b border-[var(--border-subtle)]` rows; row hover = bg `--surface-card-soft`, same as LessonCard hover.
- Header: mono kicker `DRAFTS · N PENDING` with amber dot + `h1` "Drafts" (mirrors the Learn hub section-header language).
- Empty state: reuse the EmptyState pattern (`No drafts pending` + one line of copy) — the `Learn/EmptyState` component's anatomy already exists.
- Auth-gated identically to the preview page (§5). No SEO: exclude from sitemap/robots (new route, not registered in `src/app/sitemap.ts`).
- Covers both kinds: `/drafts/blog` and `/drafts/learn` tabs or a combined queue with a kind tag — recommend a **single combined queue** with the category `Tag` + a `BLOG`/`LEARN` mono chip per row (one Operate surface, not two).

---

## 5. Auth-Gate Visual

**Recommended: a locked card, NOT a 404, NOT a bare redirect to /login.** A 404 is confusing ("the draft vanished?"); an instant redirect is jarring. The repo already ships the exact pattern for this — **GuestCTA** (`src/components/Progress/GuestCTA.tsx`): lock glyph in a navy-tinted chip + mono red kicker + headline + body + CTA. Reuse that anatomy with a new `draft` tier of copy. (BA contract: guests redirected to `/login?next=/preview/...` **or** shown a login prompt — the locked card satisfies the "login prompt" branch and keeps context; the server-side check is what actually blocks content.)

Three states, same card shell, different copy + CTA:

| State | Kicker | Headline | CTA |
|---|---|---|---|
| Unauthenticated | `PREVIEW · signed out` | "Sign in to preview drafts" | "Sign in" → `/login?next=/preview/<full-path>` |
| Signed-in, not allowlisted | `PREVIEW · no access` | "This content is not yet available" (BA copy) | "Contact the team" (mailto) — no fake button |
| Allowlisted | — | renders the preview (§3) | — |

Render the locked card **at 200 with the lock UI** (not 404) so Chris and future writers know the feature exists. The allowlist itself is a **mechanics** concern (§7) — visually it only needs the two locked states above.

---

## 6. State Model

**Binary status per the BA contract: `DRAFT → PUBLISHED`.** The review stage is *implied* by draft state (a draft is awaiting Perry's review), not a separate field. The task asked "should the preview page show the current status + which review stage it's in?" — answer: **show the binary status prominently; show the stage as prose in the strip's message line, not as a second badge.** A separate `in-review` status value would need a new field the BA spec doesn't define and the editorial cron doesn't write — out of contract, so it doesn't ship.

| Status | Pill | Strip treatment | Shown where |
|---|---|---|---|
| `draft` | amber pill, pulsing dot | amber band, "Not yet published — awaiting review" | preview strip, index row |
| `published` | emerald pill | (no strip — published page renders normally) | index row only |

The preview page shows **status + stage in one line**: the kicker pill reads `DRAFT`, and the message line carries the stage prose ("Not yet published — this preview is only visible to you / awaiting review"). No traffic-light complexity.

**Mechanics (what steel will implement — design only flags it):** add `status: draft | published` to the MDX frontmatter (blog + learn, default `published`); `scripts/build-posts.js` and `scripts/build-learn.js` filter drafts out of the generated `posts`/`learn` arrays — every downstream consumer (pages, sitemap, feed, tags, featured) then excludes them for free; the preview route reads the raw MDX by slug at request time and reuses the renderer. Allowlist: `PREVIEW_ALLOWED_EMAILS` env var checked server-side in the preview route (matching how the session cookie already gates API routes). See `requirements/draft-state.md` §Build Filtering + §Preview Route Specification for the full mechanics contract.

---

## 7. Component Inventory

### Reuse as-is (zero new code for these)
| Component | Used for |
|---|---|
| `MDXArticle` (blog + learn variants) | The draft body — identical render |
| `Header`, `Footer`, `ReadingProgress` | Preview shell |
| `BackLink` | Preview "← Back to Blog" (retarget to `/drafts` only if §4 ships) |
| `Tag` | Category on preview + index rows |
| `GuestCTA` **pattern** | Auth-gate card (new `draft` tier copy — additive, existing tiers untouched) |
| `BannerImage` / banner render block | Draft banner image |
| `EmptyState` (Learn) **pattern** | Draft index empty state (only if §4 ships) |

### New components (small, steel builds from the brief)
| Component | Props | States |
|---|---|---|
| `DraftBadge` | `status: "draft" \| "published"` | 2 pills (amber + pulse dot / emerald) |
| `PreviewStrip` | `{ title, status, backHref }` | renders above article; light/dark via semantic tokens |
| `DraftList` (only if §4 ships) | `drafts: { slug, kind, title, category, status, date }[]` | rows, empty state, loading (skeleton reusing existing shimmer) |
| `DraftLocked` | `state: "signed-out" \| "no-access", nextPath?` | 2 copy variants of the GuestCTA shell |

### Explicitly NOT touched (public site unchanged)
`src/app/blog/*`, `src/app/learn/*`, `src/data/posts.ts` shape, `sitemap.ts`, `feed.xml`, build scripts (except the one additive status filter steel adds), `content/` published files, `GuestCTA` existing tiers.

---

## 8. Tokens (additive — nothing existing changes)

The chrome reuses shipped tokens almost entirely. New tokens are **2 convenience aliases**, not a new system:

```css
/* draft preview — additive, after the existing signal tokens */
:root {
  --signal-draft-bg: var(--signal-warn-bg);        /* amber tint band */
  --signal-draft-text: var(--color-amber-700);     /* badge text (AA on tint) */
  --border-draft: var(--color-amber);              /* dashed band border */
}
html.dark {
  --signal-draft-bg: rgba(245, 158, 11, 0.14);     /* matches dark warn bg */
  --signal-draft-text: var(--accent-hover);        /* readable amber on dark */
}
```

Everything else — pill colors, kicker anatomy, card surfaces, focus ring — is existing tokens.

---

## 9. Layouts

| Viewport | Preview page | Drafts index |
|---|---|---|
| Desktop (≥768) | Status strip full-width (1120 gutter), kicker+title left, back link right; article 720px column identical to public | 820px column, rows with title / tag / pill / mono date across |
| Mobile (<768) | Strip stacks: kicker row, title, message, back link on its own line; article unchanged | Rows stack: title+pill on line 1, tag+date on line 2; touch targets ≥44px |

Both pages keep the header/footer shell; no layout invention anywhere else.

---

## 10. What Stays EXACTLY the Same (do not touch)

- Public blog/learn renderers and their routes — zero diff
- `posts.ts` shape, sort logic, sitemap/feed, build scripts (except the one additive status filter steel adds)
- Published `content/blog/*.mdx` files
- Existing GuestCTA tiers and all shipped design-system tokens
