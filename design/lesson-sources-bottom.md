# K3 — Lesson sources at the very bottom (incl. anchor offsets)

**Card:** t_15aa2216 (K3 of 19, Wave 2 — Learn UX Items 1/2/4) · **Tenant:** adroit
**Owner:** kara (design) · **Handoff to:** steel (**A2** implements) · **Scope:** design only — no implementation in this card
**Surface archetype:** **Decide/Learn** — a reading surface, so hierarchy is typographic and the interactive block is the exception, not the default.

| Artifact | Path | Status |
|---|---|---|
| **Spec (this note)** | `design/lesson-sources-bottom.md` | canonical |
| **Mockup** | `design/mockup-lesson-sources.html` | canonical: real sticky header + docked audio bar, working anchor jumps, live measurement readout |
| Screenshots | `design/screenshots/k3-desktop-1280-transition.png`, `k3-desktop-1280-sources.png`, `k3-mobile-360-sources.png` | captured from the canonical mockup |
| Earlier study sheet | `design/mockups/lesson-sources-k3.html` (commit `4a3ae864`) | compatible; its anchor-offset block was re-measured and corrected to match this note (it assumed a 104px docked bar; the real card is 140px at 1280 and 198px at 360). Use this note as the source of truth. |

---

## 1. What changes

`Sources` stops being the last thing inside the MDX body and becomes the **last content block on the
lesson page**, after the knowledge-check affordance.

```
lesson hero (title / author / share / complete)
└ article body (MDX, citations inline as superscripts)
    └ Practice Questions ─ bordered exercise card
    └ Check panel ─ navy, part of the exercise (A6)
└ SOURCES ─ last content block on the page          ← this card
└ Prev / Next navigation                            ← page chrome, not content
```

**DOM order equals visual order.** No CSS `order`, no `flex-direction: reverse`, no absolute
positioning, no `display: contents` reordering. Screen-reader order, tab order and paint order are the
same order. `Sources` is the last element carrying lesson content; only navigation follows it.

**No gating, no second completion path.** Sources is static text — it never writes progress, never
depends on auth, and does not participate in the quiz/check flow.

---

## 2. Separation rule — register, not a divider

The check panel is the loudest block on the page: navy slab, red-tinted glow, 20px radius, a white
primary button. **Sources must be the quietest.** A heavier border between two cards would still read
as "another card in the exercise"; the separation has to be a change of *register*.

| Lever | Exercise (practice card + check panel) | Sources (appendix) |
|---|---|---|
| Container | card: border, white fill, `rounded-[20px]`, `shadow-sm`, `p-7`; navy panel | **none** — sits on the page surface |
| Top boundary | 1px rule at `margin-top: 44px` | **64 × 2px navy rule at `margin-top: 72px`** (56 mobile) |
| Kicker | `PRACTICE QUESTIONS` — red, 3px red tick, mono 11px | `SOURCES` — `--ink-muted`, mono 11px, `.14em` tracking, **no tick** |
| Heading | extrabold navy `h4` 20–21.5px | none — the kicker *is* the heading (mono, subordinate) |
| Accent | red for CTA, progress, status | red **only** on the numerals |
| Body | 14.5px options, 13.5px panel copy | 13px / 1.6, `--ink-muted` |
| Density | airy, interactive targets | tight list, 1px `--border-subtle` row rules |
| Measure | 640px | 720px (the reading column) |
| Voice | 2nd person imperative | 3rd person bibliographic |

Three moves carry it, in order of importance:

1. **No card.** No radius, no fill, no shadow, no padding box. The block is text on the page.
2. **A short rule, not a border.** A **64 × 2px** navy rule (`--ink-primary`) above the kicker. A short
   heavy rule reads as *end of document*; a full-width hairline reads as *another section*.
3. **Type register flip.** Mono uppercase 11px kicker instead of an extrabold navy `h4`. Utility voice
   vs. instruction voice.

**72px** of air above the rule is the separation budget (≈1.6× the 44px used between exercise blocks).
Do **not** add a divider ornament, an icon, a background tint, a "Was this helpful?" row, or an
accordion here.

---

## 3. Structure + copy

Production markup is `remark-gfm`'s footnote section, split out by **A1** (`MDXSources.tsx`) and
placed by **A2**. Do not re-author the list — reuse the generated tree.

```html
<section class="footnotes lesson-sources" data-footnotes aria-labelledby="footnote-label">
  <hr class="sources-rule" aria-hidden="true">
  <div class="sources-head">
    <h2 id="footnote-label">Sources</h2>            <!-- renamed from "Footnotes" by MDXArticle -->
    <span class="sources-count">4 REFERENCES</span> <!-- optional, see below -->
  </div>
  <ol>
    <li id="fn-1">
      developer.salesforce.com. <a href="…">Enterprise Messaging Platform Events</a>
      <a href="#fnref-1" class="data-footnote-backref" aria-label="Back to reference 1">↩</a>
    </li>
    …
  </ol>
</section>
```

| Element | Copy | Notes |
|---|---|---|
| Heading | `Sources` | unchanged string; only the styling moves off `.footnotes h2` |
| Count meta | `{n} REFERENCES` | mono 10.5px `--ink-faint`; `1 REFERENCE` singular; suppressed at n=1. **Optional** — drop it if A1 cannot count cheaply |
| Back-reference | `↩` | keep remark-gfm's glyph and `aria-label="Back to reference n"` |

### 3.1 CSS (authoritative)

```css
/* ── Sources: the document colophon, not a card ───────────────── */
.lesson-sources{
  max-width:720px;                 /* same column as the article */
  margin:72px auto 0;              /* the separation budget */
  padding:0 24px 8px;
  scroll-margin-top:var(--lesson-anchor-offset);
}
.sources-rule{
  border:0;height:2px;width:64px;margin:0 0 18px;
  background:var(--ink-primary);border-radius:1px;
}
.sources-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.sources-head h2{
  font-family:var(--font-mono);font-size:11px;font-weight:700;
  letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink-muted);margin:0;
  /* remark-gfm ships this heading sr-only — reveal it, same overrides the
     blog's .footnotes h2 already uses */
  position:static !important;width:auto !important;height:auto !important;
  clip:auto !important;clip-path:none !important;overflow:visible !important;
  white-space:normal !important;
}
.sources-count{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;color:var(--ink-faint)}

.lesson-sources ol{list-style:none;margin:0;padding:0;counter-reset:footnote}
.lesson-sources li{
  position:relative;
  padding:9px 44px 9px 22px;       /* 22 = numeral gutter, 44 = backref gutter */
  border-top:1px solid var(--border-subtle);
  font-size:13px;line-height:1.6;color:var(--ink-muted);
  scroll-margin-top:var(--lesson-anchor-offset);
}
.lesson-sources li:first-child{border-top:0;padding-top:0}
.lesson-sources li::before{
  content:counter(footnote) ".";counter-increment:footnote;
  position:absolute;left:0;top:9px;
  font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent);
}
.lesson-sources li:first-child::before{top:0}
.lesson-sources li a{
  color:var(--ink-primary);font-weight:600;
  text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;
  text-decoration-color:rgba(200,16,46,.35);
}
.lesson-sources li a:hover{text-decoration-color:var(--accent)}
@media (max-width:767px){ .lesson-sources{margin-top:56px} }
```

**Do not use CSS grid on `li`.** `remark-gfm` emits a variable number of element children inside the
`li` (text nodes plus one `<a>` per citation); grid auto-placement would spread them across columns.
The numeral and the back-reference are absolutely positioned inside reserved padding instead, so the
layout is independent of how many children the generator emits.

**Scoping:** the blog keeps `.article-body .footnotes` exactly as it renders today. New rules are
scoped to `.lesson-sources`, which only the lesson route applies — not `/field-notes`, not the preview
routes, not `PreviewFirstLesson` (D-6).

---

## 4. Long URLs at 320–360px

```css
.lesson-sources li,
.lesson-sources li a{
  overflow-wrap:anywhere;    /* the actual fix */
  word-break:break-word;     /* older-engine fallback */
  hyphens:none;
}
```

`overflow-wrap:anywhere` is required, not `break-word`: Salesforce doc URLs have no break opportunity
inside `platform_events_intro_emp.htm`, so `break-word` alone leaves an unbreakable ~300px token.

Never set `display:inline-block` on the URL — that kills line-breaking. `text-decoration` still
applies across every broken line box.

**Measured at 360px:** text column **198px** (`312 − 22 − 44`), the longest real URL (118 chars) wraps
to **5 lines**, `scrollWidth === clientWidth === 312`. At 1280px: 558px column, 2 lines. The 44px
backref gutter costs 44px of measure on a phone — accepted trade, since source URLs are secondary and
a stable target beats 44px of URL width.

---

## 5. Back-reference tap target

`remark-gfm` renders the backref as a bare inline `↩` (~11px). It must be a real target.

```css
.lesson-sources .data-footnote-backref{
  position:absolute;right:0;top:-2px;
  display:grid;place-items:center;
  width:44px;height:44px;           /* the target */
  border-radius:50%;
  font-size:13px;line-height:1;     /* the visible glyph stays small */
  color:var(--ink-faint);text-decoration:none;
  background:transparent;
  transition:background .15s ease,color .15s ease;
}
.lesson-sources li:first-child .data-footnote-backref{top:-11px}
.lesson-sources .data-footnote-backref:hover,
.lesson-sources .data-footnote-backref:focus-visible{
  background:var(--surface-sunken);color:var(--ink-primary);
}
.lesson-sources .data-footnote-backref:focus-visible{
  outline:2px solid var(--accent);outline-offset:1px;
}
```

- **44 × 44 px** measured at both 360px and 1280px — the requirement's ≥44px path, no reliance on the
  24px + spacing fallback.
- The target lives in a **reserved 44px right gutter**: it never overlaps text and never inflates the
  row. Absolutely positioned, not inline — inline placement orphans the arrow onto its own line as
  soon as the URL wraps.
- The glyph stays 13px: a 44px circle of chrome would out-shout the citation.
- `aria-label="Back to reference n"`; the `↩` glyph itself is `aria-hidden="true"` (a bare glyph is
  announced as "leftwards arrow with hook").
- Multiple mentions of one footnote: one chip per occurrence, labelled
  `Back to reference 1 (first mention)` / `(second mention)`.

---

## 6. Anchor offsets — one custom property

The lesson page has **two** sticky layers: the site header (`h-16` = 64px, `sticky top-0 z-50`) and the
audio bar (`sticky top-16 z-40`). Without `scroll-margin-top`, a jump from a source's `↩` back to its
inline superscript lands the citation **under the audio bar** — invisible, and the reader concludes the
link is broken.

```css
:root{
  /* desktop: stuck bar bottom 204 (64 header + 140 bar) + 36px air */
  --lesson-anchor-offset: 240px;
}
@media (max-width: 767px){
  /* phone: the bar wraps to three rows → 64 + 198 = 262 + 34px air */
  :root{ --lesson-anchor-offset: 296px; }
}
/* no narration on this lesson → no audio bar → only the header */
.lesson-page:not(.lesson-page--has-audio){ --lesson-anchor-offset: 96px; }

.lesson-sources,
.lesson-sources li[id^="fn-"],
.article-body sup a[id^="fnref-"],
.article-body h2[id],
.article-body h3[id]{
  scroll-margin-top: var(--lesson-anchor-offset);
}
```

**One property, three declarations** (desktop / phone / no-audio). No JS offset math, no
`scrollIntoView`, no scroll listener — the browser's anchor algorithm does the work, so it also holds
for `location.hash` loads, back/forward and middle-click.

Rules for steel:

- **One property, one name.** Nothing else may hard-code `scroll-margin-top`.
- Declare it on `:root` (or the lesson page wrapper), not on `.lesson-sources` — headings and future
  targets consume the same value. Sources are the first consumer, not the owner.
- Do **not** add `scroll-padding-top` on `html` as a second mechanism; `scroll-margin-top` travels
  with the target, including targets inside a scroll container.
- Smooth scrolling is optional and must respect `prefers-reduced-motion: reduce`.

### 6.1 Derivation (measured, not guessed)

| Layer | Desktop 1280 | Phone 360/390 |
|---|---|---|
| Site header (`h-16`) | 64 | 64 |
| Audio bar, stuck (border box) | 140 | 198 (three rows: controls + follow-along + audio) |
| **Stuck stack bottom** | **204** | **262** |
| Air below the bar | +36 | +34 |
| **`--lesson-anchor-offset`** | **240** | **296** |
| No audio bar | 64 + 32 | **96** |

The bar's `my-6` (24px) margin is **not** honoured once the element is stuck — Chrome positions the
sticky border box at `top: 64px`. Measured, not assumed.

### 6.2 Verified landings (real browser, mockup)

| Width | Stuck stack | Target lands at | Clearance | Result |
|---|---|---|---|---|
| 1280 | 204 | 240 | **+36px** | not hidden ✔ |
| 390 | 262 | 296 | **+34px** | not hidden ✔ |
| 360 | 262 | 296 | **+34px** | not hidden ✔ |
| 1280, no audio | 64 | 96 | **+32px** | not hidden ✔ |
| 360, no audio | 64 | 96 | **+32px** | not hidden ✔ |

**Dependency on K2/A8:** the 198px phone bar assumes the three-row layout K2 resolves for the
completion control. If A8 lands a taller bar, add the delta to the phone value — the property is the
single place to change, and A2's test should assert the *landed position*, not the number.

### 6.3 Arrival state

```css
@keyframes anchor-flash{
  0%  {background:rgba(200,16,46,.16);box-shadow:0 0 0 3px rgba(200,16,46,.16)}
  100%{background:transparent;box-shadow:0 0 0 3px transparent}
}
.article-body sup a:target,
.lesson-sources li:target{
  animation:anchor-flash 1.9s ease-out 1;border-radius:4px;
}
@media (prefers-reduced-motion: reduce){
  .article-body sup a:target,
  .lesson-sources li:target{animation:none;outline:2px solid var(--accent);outline-offset:2px}
}
```

A jump that lands silently is disorienting — the reader arrives mid-paragraph with no idea which
sentence they were sent to. The 1.9s red wash marks the landing and gets out of the way; under reduced
motion it becomes a static 2px ring (still a marker, no animation).

---

## 7. Responsive behaviour

| | 1280 | 768–1279 | 360 / 390 |
|---|---|---|---|
| Column | `max-width:720px` centred | same | full width − 48px |
| Sources width | 672px | ≤672px | **312px** |
| Row padding | `9px 44px 9px 22px` | same | same |
| Text column | 558px | scales | **198px** |
| URL wrap | 2 lines | 2–3 lines | 3–5 lines |
| Backref | 44 × 44 | 44 × 44 | 44 × 44 |
| Offset | 240px | 240px | **296px** |
| Horizontal scroll | none | none | **none** |

---

## 8. States

| State | Treatment |
|---|---|
| **0 sources** | `MDXSources` returns **`null`** — no rule, no "Sources" heading, no empty list. The page ends after the exercise |
| **1 source** | Block renders; count line suppressed |
| **2–8 sources** | As specified; count line `N REFERENCES` |
| **>8 sources** | Full list, no "show more" — truncating references damages trust more than it saves scroll |
| **`:target` arrival** | 1.9s red wash; static ring under reduced motion |
| **Long title (3+ lines)** | Wraps inside the indented column; the `↩` stays pinned top-right, never floats mid-title |
| **URL with no break opportunity** | `overflow-wrap:anywhere`; row grows vertically, never horizontally |
| **Quiz not attempted / failed / no quiz file** | Identical — the appendix does not depend on quiz state |
| **Guest** | Identical. References are never gated |
| **No audio narration** | Offset drops to 96px; everything else identical |
| **Dark theme** | No new colours: `--ink-primary` / `--ink-muted` / `--ink-faint` / `--border-subtle` / `--accent` / `--surface-sunken` all flip with `html.dark`. The 2px rule uses `--ink-primary`, so it becomes light on dark |
| **Print** | Sources is the last printed section; hide `↩` chips (`display:none`), keep URLs as visible text |

---

## 9. Accessibility

- `section[data-footnotes]` + `<ol>` keep the generator's list semantics; numerals are CSS-generated
  (`::before`), so a screen reader hears "list, 4 items", not "1. 1.".
- The backref is the last focusable element of its row; focus order follows DOM order.
- Jumped-to targets get `tabindex="-1"` so the anchor move also moves focus — otherwise keyboard users
  are left at the previous focus position.
- Contrast: `--ink-muted` (#4B5563) on `--surface-page` (#F7F8FA) = **7.6:1**; numerals `--accent`
  (#C8102E) = **5.6:1**. Both pass AA at 11–13px.
- The 44px target satisfies WCAG 2.2 §2.5.8 without relying on the spacing exception.
- The arrival flash is animation-only and is disabled under reduced motion.

---

## 10. What steel must build (A2)

1. Render `MDXSources` **after** the check panel and **before** `LessonNavigation` — DOM order, no CSS
   reordering. Blog, `/preview/*` and `PreviewFirstLesson` stay `inline` (D-6).
2. Apply the §3.1 CSS scoped to `.lesson-sources`; leave `.article-body .footnotes` untouched so the
   blog render stays byte-identical (A1's proof).
3. Declare `--lesson-anchor-offset` (`:root` + the ≤767px media query + the no-audio state) and put
   `scroll-margin-top` on the selector groups in §6.
4. Keep remark-gfm's `↩` anchor and `aria-label`; restyle only.
5. Tests to add:
   - DOM order: `section[data-footnotes]` is the last content element, after the check panel, before nav.
   - Exactly one `section[data-footnotes]` on the page.
   - No footnote definitions → no `section[data-footnotes]` and no "Sources" text, at both widths.
   - Anchor jump: click a backref, assert the target's `getBoundingClientRect().top ≥` the sticky stack
     bottom — derive the expectation from the property, not a hardcoded number.
   - `page.overflow.test` extended to 360px with a long-URL fixture.

---

## 11. Verification evidence

Mockup: `design/mockup-lesson-sources.html` — serve it over HTTP (`file://` is blocked in workers) and
open it. It renders the real order at **1280 × 760** and **360 × 760** in independently scrollable
frames, with an audio-bar on/off toggle, a live measurement readout, and clickable `↩` arrows that
report the landing position.

Measured in Chrome, 2026-10-25:

| Check | 1280 | 390 | 360 |
|---|---|---|---|
| `scrollWidth / clientWidth` | 1280/1280 | 390/390 | **360/360** |
| Sources block width | 672 | — | **312** |
| Longest real URL → lines | 2 | 3 | **5** |
| `↩` target | 44×44 | 44×44 | **44×44** |
| `scroll-margin-top` resolved | 240 | 296 | **296** |
| Jump clearance below the bar | **+36** | **+34** | **+34** |
| No-audio jump clearance | +32 | — | **+32** |

Visual check (`k3-desktop-1280-transition.png`, `k3-mobile-360-sources.png`): the navy check panel and
the Sources block read as two different things; no clipping, no misalignment, no horizontal scroll.

**Slop self-audit: 1/10.** Single deduction: #9 (Inter — the repo's existing type system, kept
deliberately for consistency with the rest of Learn). No gradient, no glass, no accent rail, no icon
topper, no monument stat, no center stack, no feature-tile grid, no wrong surface.

**Wow bar: 4/6** — typographic scale (72px air + 64px heavy rule against an 11px mono kicker) ✓;
craft details (reserved gutters, 1px row rules, hover/focus states) ✓; motion (arrival flash +
reduced-motion path) ✓; signature element (end-of-document rule + red numerals) ✓; depth ✗;
real imagery ✗ — n/a for a citation apparatus on a reading surface; photos here would be decoration
pretending to be content.

---

## 12. Acceptance mapping

| Acceptance criterion | Where satisfied |
|---|---|
| Desktop 1280: Sources visibly separate from the exercise | §2 (unbounded vs bounded, 72px throw, mono kicker, no card) + `k3-desktop-1280-transition.png` |
| Desktop 1280: back-reference targets usable | §5 (44×44 measured, focus ring, `aria-label`) |
| Mobile 360/390: long URLs wrap | §4 `overflow-wrap:anywhere`; measured 5 lines at 360, no overflow |
| Mobile 360/390: no horizontal scroll | §11 `scrollWidth === clientWidth` at 360 and 390 |
| Mobile: back-reference targets usable | §5 unchanged at all widths; 44×44 measured |
| Anchor jump not hidden under the sticky bar | §6 single property: **240px** desktop / **296px** phone / **96px** no-audio; measured +36 / +34 / +32 clearance |

## 13. Out of scope

No gating, no second completion path, no "mark as read" on sources, no citation popovers, no accordion,
no change to how citations are authored (`[^n]`) or to blog-post footnote rendering. The check panel's
own design belongs to A6; the audio bar's layout belongs to K2/A8 — this card only fixes the boundary
above Sources and measures the bar.
