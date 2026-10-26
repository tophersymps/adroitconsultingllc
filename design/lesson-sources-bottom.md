# K3 — Lesson sources at the very bottom (incl. anchor offsets)

**Card:** t_15aa2216 (K3 of 19, Wave 2 — Learn UX Items 1/2/4)
**Owner:** kara (design) · **Handoff to:** steel · **Scope:** design only — no implementation in this card

| Artifact | Path | Status |
|---|---|---|
| **Spec (this note)** | `design/lesson-sources-bottom.md` | canonical |
| **Mockup — live page** | `design/mockups/lesson-sources-k3.html` | canonical: real sticky header + docked audio bar, working anchor jumps in both directions |
| Screenshots | `design/screenshots/lesson-sources-desktop-1280.png`, `…-mobile-360.png`, `…-mobile-390.png` | captured from the canonical mockup |

A second annotated study sheet produced earlier in this card's history
(`design/mockup-lesson-sources.html`, uncommitted) is **superseded** where it disagrees: it assumed
a flat 240px anchor offset and a 4-reference list. Its framing notes on register contrast are still
worth a read; implement from this note, not from it.

---

## 1. Surface + stance

**Surface archetype: Decide/Learn** (lesson reading → practice → completion). The Sources list is the
page's **appendix**, so it is designed as *reference*, not as content momentum:

- No card, no fill, no shadow, no accent bar, no CTA. The block sits on the page surface.
- Red (`#C8102E`) belongs to the exercise. The appendix's only red is the small numerals.
- The exercise is a **bounded object** (bordered quiz card + navy result panel). The appendix is
  **unbounded text**. That register contrast is the separation strategy — not a divider ornament.

Block order on the lesson page is now:

```
lesson header (title / author / share / complete)
↓  body (MDX, ends with an inline superscript reference)
↓  PRACTICE QUESTIONS ─ bordered exercise card
↓  CHECK PANEL ─ navy result panel, part of the exercise
↓  SOURCES ─ last block on the page          ← this card
↓  Prev / Next lesson navigation
```

---

## 2. What makes Sources *not* read as part of the exercise

| Lever | Exercise (practice + check panel) | Sources (appendix) |
|---|---|---|
| Container | bordered card, `rounded-16`, white fill + shadow; navy panel | **no container** — plain page surface |
| Top boundary | 1px rule at `margin-top: 44px` (mobile 36) | **1px rule at `margin-top: 64px` (mobile 48)** + `padding-top: 24px` (mobile 20) |
| Kicker | `PRACTICE QUESTIONS` — red, 3px red tick, uppercase mono | `REFERENCES` — `gray-500`, 14px gray **hairline** tick, uppercase mono, 10.5px |
| Heading | `1.35rem/800` navy, "Check your understanding" | `1.125rem/800` navy, "Sources" (smaller = subordinate) |
| Color | red + white + navy fill | navy text, gray metadata, red **numerals only** |
| Measure | 640px (question column) | 720px (reading column) |
| Voice | 2nd person imperative ("Answer all three…") | 3rd person bibliographic |

**Do not** add a divider ornament, an icon, a background tint, a "Was this helpful?" row, or an
accordion here. The 64px throw (vs 44px between body blocks) plus bounded-vs-unbounded carries it.

```
REFERENCES            ← mono eyebrow, uppercase, tracking .08em, gray-500, gray hairline tick
Sources               ← h2, 1.125rem/800 navy
3 sources · cited in this lesson   ← mono 10.5px, gray-400
1.  <citation title>
    <url>                            ↩
2.  …
```

The count line is suppressed when there is exactly one source; the entire block is not rendered when
there are zero.

---

## 3. Entry anatomy (per source)

```
1.  Cagan, M. — Transformed: Moving to the Product Operating Model, ch. 7            ↩
    https://www.svpg.com/transformed-moving-to-the-product-operating-model/
    chapter-7-discovery-and-the-product-model-in-practice
```

| Property | Desktop | Mobile | Class |
|---|---|---|---|
| list | `<ol>`, `list-style:none`, `counter-reset` | same | `.lesson-sources ol` |
| numeral | red `#C8102E`, mono 12px/700, absolute at `left:0` | same | `li::before` |
| title | `gray-800` `#1F2937`, 14px/600, `line-height:1.6` | 13px | `.src-title` |
| url | navy, mono 12px/500, own block line, underlined | mono 11.2px | `.src-url` |
| row gap | 14px | 14px | `li { margin-bottom }` |
| indent | `padding-left: 26px` | 24px | — |
| right gutter | `padding-right: 34px` (keeps text clear of the chip) | same | — |
| back-ref | 24×24 chip, absolute top-right of the row | same | `.src-backref` |

Notes:

- The chip is **absolutely positioned at the entry's top-right**, not inline after the URL. Inline
  placement orphans the arrow onto its own line as soon as the URL wraps (observed in review, fixed).
  The `padding-right: 34px` keeps the first line of the title from ever colliding with it.
- The title is not a link; the URL carries the affordance. One clear tap target per row, and no
  "two links to the same place" screen-reader stutter.
- Wrapped titles stay flush: the numeral is absolute, so no hanging-indent drift. (Attempt-1's
  `grid 22px/1fr/44px` is an equally valid alternative if steel prefers explicit columns; either
  produces the same render at 320–1280.)

---

## 4. Long URLs at 320–360 px

Failure mode: a citation URL has no break opportunity, so the `<a>` pushes the row wider than the
viewport and the whole page scrolls horizontally. Contract (as implemented and measured in the
mockup):

```css
.lesson-sources li        { overflow-wrap: anywhere; }
.lesson-sources a,
.lesson-sources .src-url  { overflow-wrap: anywhere; word-break: break-word; }
```

Rules:

- `overflow-wrap: anywhere` — a bare `break-word` will not break inside a long path segment in every
  engine; `anywhere` guarantees it and also lets a flex/grid child shrink below its content size.
- Never set `display:inline-block` on the URL: that kills line-breaking. `text-decoration` still
  applies across every broken line box.
- `.src-url` is its own block line so the URL starts at a predictable x-position regardless of title
  length — this is what makes a long URL readable when broken.
- Not assumed, measured: with a 180-character unbroken token substituted into a URL, the mockup holds
  `scrollWidth === clientWidth` at 320, 360, 390 and 1280.

---

## 5. Back-reference targets (tap targets)

**Visual box 24×24 + 8px of spacing, expanded to a 44×44 pointer area** — satisfies both readings of
the acceptance line ("≥44px target **or** 24px + spacing") without inflating the row.

```css
.lesson-sources .src-backref{
  position:absolute; top:-1px; right:0;
  display:inline-flex; align-items:center; justify-content:center;
  width:24px; height:24px;            /* visible 24×24 */
  border-radius:6px;
  color:#8A94A6; font-size:12px; font-weight:700;
  text-decoration:none;
  transition:background-color .15s ease, color .15s ease;
}
.lesson-sources .src-backref::before{ /* invisible 44×44 hit area */
  content:""; position:absolute; inset:-10px; border-radius:10px;
}
.lesson-sources .src-backref:hover,
.lesson-sources .src-backref:focus-visible{
  background:var(--color-gray-100); color:var(--color-red-dark);
}
.lesson-sources .src-backref:focus-visible{ outline:2px solid var(--color-red); outline-offset:2px; }
```

- `aria-label="Back to reference N"` on the link; the `↩` glyph is `aria-hidden="true"` (a bare
  glyph is announced as "leftwards arrow with hook").
- Applies unchanged at every width — no mobile-specific enlargement, so the row rhythm is stable.
- Multiple mentions of the same footnote: one chip per occurrence, labels
  `Back to reference 1 (first mention)` / `(second mention)`.
- Contrast: `#8A94A6` on white is 3.6:1 — acceptable for a non-text control (≥3:1) but weak. Prefer
  `#6B7686` (5.0:1) for the resting colour; keep the red on hover/focus.

---

## 6. Anchor offsets — one custom property

Both directions of the jump break without this: source `↩` → inline superscript, and superscript →
source entry. Both land under the sticky band today.

```css
/* app/globals.css — the single source of truth */
:root { --lesson-anchor-offset: 208px; }                    /* header + docked audio bar */
body:not(:has([data-audio-scroll])) { --lesson-anchor-offset: 112px; }

/* apply to every jump target on a lesson page */
.lesson-body :is(h2, h3, h4)[id],
.lesson-body sup[id],
.lesson-sources [id],
.lesson-sources li[id] {
  scroll-margin-top: var(--lesson-anchor-offset);
}
```

**Why 208 / 112 — measured, not guessed.** The lesson page's sticky band is the site header
(`h-16` = 64px) plus, when the lesson has narration, the audio player docked at `top-16`. In the
mockup at 1280 and at 360 the docked card is 104px tall, so the band bottom sits at **168px**;
adding 40px of clearance gives **208px** — which puts the jumped-to line at `top: 208px`, i.e. 40px
below the band, fully visible at both widths (verified). With no audio bar the band is 64px, and
112px leaves 48px of clearance. 512 of 512 lessons under `content/learn` currently have narration,
so 208px is the common case, not the exception.

Rules for steel:

- **One property, one name: `--lesson-anchor-offset`.** Nothing else may hard-code
  `scroll-margin-top`. If the bar's height changes, this number changes and nothing else does.
- Declare it on `:root`, not on `.lesson-sources` — body headings and future targets consume the same
  value. Sources are the first consumer, not the owner.
- Do not add `scroll-padding-top` on `html` as a second mechanism. `scroll-margin-top` travels with
  the target, including targets inside a scroll container.
- Smooth scrolling is optional and must respect `prefers-reduced-motion: reduce`.
- Landscape phones and the docked bar can shrink, so verify, don't assume: after a jump,
  `document.querySelector('#fnref-1').getBoundingClientRect().top` must be ≥ band bottom + 32.
  (Mockup measured 208 vs band 168 → 40px clearance at 1280, 390, 360.)
- Optional landing cue (in the mockup): the jumped-to marker pulses for 900ms
  (`prefers-reduced-motion` → no animation). Editorial nicety, not required by acceptance.

---

## 7. States

| State | Treatment |
|---|---|
| 0 sources | Block not rendered — no empty list, no "No sources" copy. The page ends after the exercise. |
| 1 source | Block renders; count line suppressed. |
| 2–8 sources | As specified; count line `N sources · cited in this lesson`. |
| >8 sources | Full list, no "show more". Truncating references damages trust more than it saves scroll. |
| Long title (3+ lines) | Wraps inside the indented column; the `↩` stays pinned top-right and never floats mid-title. |
| URL with no break opportunity | `overflow-wrap:anywhere`; the row grows vertically, never horizontally. |
| Quiz not attempted / failed / no quiz file | Sources render identically — the appendix does not depend on quiz state. |
| Guest (not signed in) | Sources still render. References are never gated. |
| Dark theme | `--color-gray-*` and navy flip with the existing `.dark` tokens; the chip uses `gray-400`/`gray-500`, hairline rule uses `--border-default`. No new colours. |
| Print | Sources is the last printed section; hide `↩` chips (`display:none`) and keep URLs as visible text. |

---

## 8. Accessibility + semantics

- `<section class="lesson-sources" aria-labelledby="footnote-label">` wrapping
  `<h2 id="footnote-label">Sources</h2>` — the same id `remark-gfm` already emits for the footnote
  label, so the existing heading rename keeps working. Edge visible; the eyebrow is decorative.
- `<ol>` not `<ul>`: the numbers are referenced from the body, so the order is meaningful. Numbers
  are CSS-generated, keeping the DOM text clean.
- **Reading order must equal DOM order equals visual order.** Sources is the last node of the lesson
  article, after the practice/check section. CSS `order` / `display:contents` reordering of the
  existing footnote section is forbidden — screen readers would announce sources before the
  exercise. See §9 for the sanctioned mechanism.
- Focus management: jumped-to targets get `tabindex="-1"` so the anchor move also moves focus;
  otherwise keyboard users are left at the previous focus position.
- The chip is a real link with a focus ring, not a span with an onclick.

---

## 9. Implementation interface for steel (no code in this card)

The hard part is not CSS. `remark-gfm` **appends the footnote section to the end of the MDX output**,
and today `MDXArticle` renders inside `.article-body`, which ends *before* `LessonQuiz`. So the
sources currently sit above the exercise. Three options, best first:

1. **Recommended — inject the exercise into the MDX stream.** In the lesson page, splice a
   `<LessonPractice />` marker into `mdxBody` immediately before the first footnote definition
   (`^\s*\[\^[^\]]+\]:` at line start) and expose it through `MDXArticle`'s `components` map. Compiled
   order becomes: body → practice card → check panel → footnote section, so Sources lands last in the
   DOM for free. Ids (`fn-1`, `fnref-1`, `footnote-label`) stay intact, no duplication, SR order
   correct. Guard: when the lesson has no footnote definitions, append the marker at the end of the
   source. Blog posts pass no marker and keep today's in-article footnotes untouched.
2. **Acceptable — split at the definition boundary.** Strip definitions from the body source and
   render a synthetic MDX document (definitions only) inside the new Sources section. Use only if the
   splice in (1) proves unreliable (e.g. a definition inside a fenced code block); you then own
   re-linking `↩` back to `#fnref-n`.
3. **Do not** reorder with CSS. Visual order would diverge from DOM order.

New CSS goes in a scoped `.lesson-sources` block in `globals.css`, plus the single `:root` property
from §6. The existing `.article-body .footnotes` rules stay for blog posts; the lesson page should
either stop matching that selector or override it deliberately (do not delete the blog styling).

---

## 10. Verification (evidence from this card)

Measured in the canonical mockup in a real browser, not inferred:

| Check | 1280 | 390 | 360 | 320 |
|---|---|---|---|---|
| Sources top gap from the check panel | 64px | 48px | 48px | 48px |
| `scrollWidth / clientWidth` (no horizontal scroll) | 1280/1280 | 390/390 | **360/360** | **320/320** |
| No horizontal scroll with a 180-char unbroken URL token | ✓ | ✓ | ✓ | ✓ (wraps to 7 lines) |
| Longest real URL line count | 2 | 3 | 3 | 4 |
| `↩` visible box / effective hit area | 24×24 / 44×44 | same | same | same |
| `↩` stays on the entry's first line after wrapping | ✓ | ✓ | ✓ | ✓ |
| Anchor jump clearance below the sticky band | 40px | 40px | 40px | — |
| `scroll-margin-top` resolved on targets | 208px | 208px | 208px | 208px |

Screenshots: `design/screenshots/lesson-sources-desktop-1280.png`,
`lesson-sources-mobile-360.png`, `lesson-sources-mobile-390.png`.

---

## 11. Slop + wow self-audit

**Slop score: 1/10.** No gradient, no glass, no accent rail, no icon topper, no monument stat, no
center stack, no feature-tile grid. Single deduction: red numerals are the safe choice — kept
because red is the lesson page's established reference accent.

**Wow bar: 4/6.** Typographic scale (display title → mono eyebrows → mono numerals → mono URLs) ✓;
craft details (2px underline, broken-URL typography, chip that stays quiet until hover) ✓; depth via
register contrast (bounded exercise card vs unbounded appendix) ✓; signature detail (the "reference
desk" row: numeral column, mono URL, silent back-ref, landing pulse) ✓; motion — only hover/underline
transitions, appropriate here ✗; real imagery — n/a for an appendix ✗. Adding imagery or
choreographed motion to a sources list would be slop, not wow; 4/6 is the ceiling this block should
aim for.

---

## 12. Acceptance mapping

| Acceptance criterion | Where satisfied |
|---|---|
| Desktop 1280: Sources visibly separate from the exercise | §2 (unbounded vs bounded, 64px throw, gray hairline tick, smaller heading) + desktop screenshot |
| Desktop 1280: back-reference targets usable | §5 (24×24 chip, 44×44 hit area, focus ring, `aria-label`) |
| Mobile 360/390: long URLs wrap | §4 `overflow-wrap:anywhere`; measured 360/360 and 390/390 |
| Mobile 360/390: no horizontal scroll | §10 measured `scrollWidth`/`clientWidth` parity, incl. a 180-char token |
| Mobile: back-reference targets usable | §5 applies unchanged at all widths; measured 44×44 |
| Anchor jump not hidden under the sticky bar | §6 single property `--lesson-anchor-offset` (208px with the docked audio bar, 112px without); measured 40px clearance |

## 13. Out of scope

No gating, no second completion path, no "mark as read" on sources, no citation popovers, no change
to blog-post footnote rendering.
