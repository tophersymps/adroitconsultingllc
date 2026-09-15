# Adroit Blog — Design Discovery: Dark Mode Refresh (Research + Token Spec)

**Task:** t_30fa07a5 · **Author:** kara (designer) · **Date:** 2026-08-12
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Parent (context):** round-3 dark mode shipped in t_f1f7696b → steel; audited by lara (t_926221f7)
**Type:** DISCOVERY — research + direction + token spec. The EXECUTION task composes mockups from this brief.

---

## 0. What This Discovery Covers

A **refresh**, not a greenfield build. The blog already ships a complete class-based dark mode
(`html.dark` remap in `src/app/globals.css:543-575`, ThemeProvider toggling the `dark` class on
`<html>`, FOUC guard, `@custom-variant dark`). lara's a11y audit (t_926221f7, 2026-08-11) confirmed
the dark ink/accent tokens are **mostly fixed** — but found 1 real dark-mode contrast failure and
noted the dark surfaces render as a *plain slate inversion*.

This discovery answers three questions for the execution task:

1. **What is actually broken or weak in dark mode right now?** (research — grounded in lara's
   measured ratios + a grep of shipped surfaces)
2. **What should the refresh direction be?** (surface posture + one-line direction + reference
   vocabulary)
3. **What is the token spec steel implements?** (additive + targeted-fix token CSS, contrast-checked)

**Builds ON** the shipped round-3 dark mode. Nothing passing is churned. The refresh is
*additive refinement + one targeted fix*, not a re-theme.

---

## 1. Surface Archetype (committed before tokens)

Dark mode is **not a page** — like the motion system, it is a **cross-cutting theme layer** that
serves the host surfaces. It gets no hero, no card grid, no its own "look." It must preserve the
*light mode's* semantic hierarchy exactly, just relit for a dark room.

| Host surface (unchanged from light) | Dark-mode posture | Why |
|---|---|---|
| Blog/learn grids (Explore) | Glanceable depth | Cards must separate from the page by **elevation**, not brightness alone |
| Post/lesson detail (Decide/Learn) | Quiet, low-glare reading | The article is the object; chrome recedes |
| Progress rows / status (Monitor) | Signal-faithful color | done/warn/current must map to dark variants that still read at a glance |
| Forms / quiz / settings (Operate) | Clear focus + filled surfaces | Selection & focus states dominate on dark |

**Anti-slop consequence:** dark mode is NOT "invert the palette + purple glow." It keeps the navy
#0B1D3A / red #C8102E brand, keeps the off-white semantic scale, and only re-weights surface
luminance + elevation. No centered hero, no tech gradient, no accent rails.

---

## 2. The One-Line Direction

> **"The brand's night edition."** Dark mode should read as the Adroit/Fortress palette living
> after dark — deep navy ink, red as the single lit signal, elevation doing the separating —
> not a generic gray inversion of the light UI.

Reference vocabulary (from popular-web-designs):
- **Linear (dark)** — the dark mode is *quieter* than light: fewer competing fills, elevation via
  hairline borders + tight shadows, the brand accent reserved for interactivity. We borrow
  "fewer fills, more hairlines."
- **Notion / iA Writer (dark reading)** — the prose surface stays neutral and low-glare; nothing
  competes with the article. We borrow "the article owns the screen in dark."
- **Vercel (dark browse)** — card grids on dark separate by a 1-step surface lift + a border, not
  by brightness jumps. We borrow "cards separate by one step + hairline, not by going whiter."

---

## 3. Research — Current Dark-Mode State (grounded)

### 3.1 What is shipped (src/app/globals.css:543-575)

Class-based, `html.dark` remaps the same semantic tokens used in light:

| Semantic token | Light | Dark (shipped) |
|---|---|---|
| `--surface-page` | `--color-off-white` #F7F8FA | **#0A0E1A** |
| `--surface-card` | #FFFFFF | **#121A2E** |
| `--surface-card-soft` | gray-50 #F9FAFB | **#0E1526** |
| `--surface-sunken` | gray-100 #F3F4F6 | **#0C1322** |
| `--surface-inverse` | navy #0B1D3A | **#1E293B** |
| `--surface-inverse-hover` | navy-light | **#334155** |
| `--ink-strong / primary / body / muted / faint` | gray-900→400 + navy | **#F1F5F9 / #E2E8F0 / #CBD5E1 / #94A3B8 / #7F8CA3** |
| `--ink-on-inverse` | #FFFFFF | **#F8FAFC** |
| `--accent / hover / bg` | red #C8102E / red-dark / red | **#F05066 / #F47385 / #C8102E** |
| `--signal-done / warn` | emerald #10B981 / amber | **#34D399 / #FBBF24** |
| `--shadow-*-light` | light shadows | tighter dark shadows (0.5–0.6 alpha black) |

This is a **competent, contrast-valid dark mode** — and it is already navy-undertoned, not neutral
gray. Good base.

### 3.2 lara's findings relevant to dark (t_926221f7)

- **[HIGH — DARK, live] Learn h1 gradient tail invisible.** `src/app/learn/page.tsx:65` renders the
  h1 with `from-[var(--ink-primary)] to-[var(--surface-inverse-hover)]` + `bg-clip-text`. In dark
  the endpoint is `--surface-inverse-hover` **#334155 on page #0A0E1A = 1.86:1** — the right end of
  the "Learn" headline fades into the background (large text needs **≥3:1**).
  **Fix:** the dark gradient endpoint must be a light slate. lara validated `#94A3B8` gives **>3:1**
  on the page. → This becomes a dedicated `--ink-gradient-end` token (see §5).
- **[PASS, verified] Dark accent `#F05066` on card = 4.98:1** — safe to keep as dark accent text.
  On `--surface-inverse` (#1E293B) it is 4.21:1, but components use `--ink-on-inverse` white there,
  so no live failure. Do NOT change the passing accent.
- **[PASS, verified] Dark `--ink-faint` #7F8CA3** = 5.67 on page / 5.10 on card — safe.
- **Light-mode failures (out of scope, noted for a future light refresh):** light `--signal-done`
  #10B981 on white (2.54:1) and light `--color-red-light` #E8354A as text on white (4.17:1). This
  task is dark-focused; do not let the execution task "fix" these by touching light values.

### 3.3 What the refresh actually needs to do

Reading the shipped values + lara's numbers, the dark mode is **~90% there**. The refresh is three
small, disciplined moves:

1. **Fix the one real defect** — the Learn gradient tail (add `--ink-gradient-end`).
2. **Give dark mode its depth language.** Today cards separate from the page only by a 0.02-alpha
   difference (#121A2E vs #0A0E1A). Dark surfaces need *hairline borders + tight elevation* to read
   as stacked (the Linear "fewer fills, more hairlines" lesson). Add dark border-enhance + elevation
   tokens.
3. **Rehome the glow system for dark.** The existing `--shadow-glow-*` set (design/design-tokens.css,
   t_e3c87690) was tuned for light backgrounds — category glows at 0.08–0.28 alpha will be nearly
   invisible or muddy on #0A0E1A. Add dark glow variants so the signature category treatment
   survives after dark.

Everything else stays. That is the honest scope.

---

## 4. States & Edge Cases the Token Spec Must Cover

| State / surface | Dark requirement |
|---|---|
| Focus-visible | Red ring `#C8102E` — must re-verify on dark page (≥3:1 non-text). Ship a dark-tuned focus ring token. |
| Card hover | One-step lift + border brighten (hairline #334155) — not a shadow jump. |
| Disabled | `disabled:opacity-50` on dark — exempt from 4.5:1 (lara LOW, verify it stays). |
| Loading skeleton | Shimmer must invert for dark (light shimmer reads as glowing boxes on dark). |
| Empty state | Same muted-ink treatment, dark-mapped. |
| Code block / pre | Dark `#070B14` bg + slate text — already correct, keep. |
| Gradient headlines (Learn, tags) | Endpoint = `--ink-gradient-end` (dark `#94A3B8`). |
| Category glow panels (Featured, PathCard) | Dark glow variants. |
| Reading progress bar | Track `--surface-sunken`, fill `--accent` — already mapped, keep. |
| Scrollbar (if custom) | Dark thumb on dark track. |

---

## 5. Token Spec (summary — full CSS in design-tokens-darkmode.css)

**Additive + targeted. Nothing that passes is re-derived.**

- `--ink-gradient-end` — the gradient-headline endpoint. Dark = `#94A3B8` (>3:1 on page, lara).
  Light = a mid-slate (`#4B5563`) or keep current behavior — execution mockups decide; the token is
  the contract.
- `--surface-hairline` (dark) — `#1E293B`-family 1px border for card separation.
- Dark elevation: `--elev-card-dark`, `--elev-card-hover-dark` — tight black-shadow + 1px hairline,
  replacing the flat 0.02-luminance separation.
- Dark glows: `--shadow-glow-*-dark` per category — re-tuned alpha/luminance for dark bg.
- Dark focus ring: `--focus-ring-dark` — brighter red for dark surfaces.
- Dark skeleton: `--skeleton-shimmer-dark` — inverted shimmer.
- `--surface-overlay` (dark) — modal/backdrop tint.
- Keep EVERY passing token from §3.1 exactly as shipped.

Full usage examples + the exact `html.dark` block steel applies live in
`design/discovery/design-tokens-darkmode.css`.

---

## 6. Component Inventory for the Execution Task

The EXECUTION task composes mockups (and updates `design-system.html`) for:

1. **Blog listing + learn hub in dark** — card grid separating by hairline + lift; category glow
   surviving on dark; read/current badges color-mapped.
2. **Post / lesson detail in dark** — the quiet reading surface; gradient headline fixed; code
   block, blockquote, pull-quote mapped.
3. **Learn h1 gradient fix** — the before/after for the contrast defect (the single tangible "refresh").
4. **Forms / quiz / settings in dark** — focus ring, filled surfaces, segmented control, quiz
   option states (selected/correct/wrong) all dark-mapped.
5. **Progress + status in dark** — content bar / user bar / done / warn, dark variants.
6. **Motion-lab note** — confirm `prefers-reduced-motion` still covers all dark transitions.

States matrix: default, hover, active, disabled, loading (dark skeleton), empty, error, focus,
selected, correct, wrong, complete, current — each in BOTH modes.

---

## 7. Handoff Notes for Steel (implementation)

- **Do NOT touch the passing dark values** in `html.dark` (accent #F05066, ink-faint #7F8CA3, all
  surface/ink/border). They pass; churning them risks regression. Only ADD the §5 tokens.
- **Learn gradient:** change `to-[var(--surface-inverse-hover)]` → `to-[var(--ink-gradient-end)]`
  for the `learn/page.tsx` h1 (and any other gradient headline that uses a surface token as its
  endpoint).
- Dark mode is class-based — the `dark:` variant follows `.dark` on `<html>`, not the OS media
  query. Keep the `@custom-variant dark` line.
- Re-run lara's contrast audit after implementation (the refresh adds tokens; confirm nothing
  regresses and the gradient is now ≥3:1).
- No new npm deps. All depth is CSS tokens + existing Tailwind utilities.

---

## 8. Mood Boards

Generated via FAL (pollinations required an API key — noted in metadata, FAL fallback used, free).
**Atmosphere references, not production assets** — AI text is gibberish by design; execution
mockups use real copy.

- `design/discovery/moodboards/moodboard-darkmode-reading.png` — deep navy page, off-white article,
  red accent, quiet reading posture.
- `design/discovery/moodboards/moodboard-darkmode-prose.png` — long-form reading, code block, glow,
  editorial hierarchy.
- `design/discovery/moodboards/moodboard-darkmode-browse.png` — dark browse: card grid, red active
  tab, emerald read badge, mono counters.

---

## 9. Slop Self-Audit (this direction, scored before delivery)

- Tech gradient: 0 (navy/red brand kept; the one gradient is a contrast fix, not decoration)
- Generic tech hue: 0 (no purple/indigo; dark stays navy+red)
- Feature-tile grid: 0 (dark mode is a theme layer, not a page)
- Accent rail: 0 (no colored left strips introduced)
- Unearned blur: 0 (no glassmorphism added; depth is hairline + elevation)
- Monument stat: 0 (no oversized decorative numbers)
- Icon topper: 0
- Center stack: 0 (layouts unchanged from light)
- Default type: 0 (Inter + mono unchanged)
- Wrong surface: 0 (theme-layer posture committed in §1)
- **Score: 0/10**

Wow-factor levers for execution: the gradient-headline before/after (a real fix with visible
impact), dark category glows that survive after dark, hairline-elevation card depth, inverted
skeleton.

---

## 10. Discovery Outputs (this task)

| File | Purpose |
|---|---|
| `design/discovery/direction-brief-darkmode-refresh.md` | THIS brief — research, direction, states, handoff |
| `design/discovery/design-tokens-darkmode.css` | Additive + targeted-fix dark token spec for steel + execution |
| `design/discovery/moodboards/moodboard-darkmode-*.png` (3) | Atmosphere references |
