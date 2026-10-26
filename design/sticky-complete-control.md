# K2 — Completion control in the sticky audio bar

**Card** t_239eb3ed · Wave 2 (Learn UX, Items 1/2/4), K2 of 19
**Status** Design only. No implementation in this card.
**Designer** kara · 2026-10-25
**Sheet** [`design/mockup-sticky-complete.html`](./mockup-sticky-complete.html) — every number in this document is read from its live DOM
**Surface** *Operate* — a utility dock inside a Decide/Learn reading surface

---

## 1. What this adds

One control, in the existing header row of the lesson audio bar:

| State | Renders | Interactive |
| --- | --- | --- |
| Incomplete | `<button>` "Mark complete", 143 × 44 | yes |
| Complete | `<span role="status">` "Completed", 113 × 30 inside the same 144 × 44 slot | no |

The **complete** state is not a toggle. Un-marking stays in the hero control above the article (the
circular 48 px check that already exists, `src/components/Progress/MarkComplete.tsx`).

**What does not change**

- No gating. The control is a completion affordance, never a lock, paywall or prerequisite.
- No second write path. The bar calls the same `useLessonProgress` hook as the hero, which POSTs
  `/api/progress/lesson`. Nothing new touches Supabase.
- The guest card ("Audio is a free perk for signed-in readers") and the no-narration case (no bar at
  all) are untouched.

---

## 2. Why this shape

**Surface first.** The lesson page is a Decide/Learn surface, but the sticky bar inside it is
*Operate*: the reader is taking actions while listening, and the state has to be legible at a glance
without competing with the prose. That rules out a filled primary button (a filled CTA pinned to the
viewport for 12 minutes becomes wallpaper) and rules out any marketing composition.

**Terminal, not adjacent.** `Mark complete` sits at the end of the header row, after Follow-along and
Speed, separated by a 1 px rule. It is a different action axis from playback — the rule is the only
decoration in the bar and it carries meaning (playback · progress). It is dropped under 560 px, where
alignment does the same job.

**Outlined, not filled.** Resting state is `--card` with a `--line-strong` border and navy label
(16.8:1). Hover sinks the surface one step and darkens the border. Nothing lifts, nothing glows: the
control lives inside someone else's card.

**The check glyph appears only when complete.** A tick on an incomplete lesson reads as a promise, not
a state. The button is text-only; the chip carries the tick.

---

## 3. The crowding case at 360 px — the decision the card asked for

Four groups plus the label need more than one row. Measured on the sheet (intrinsic widths, read from
the live DOM at 1280): **label 173 + Follow-along 104 + Speed 106 + slot 144 + three 8 px gaps =
551 px** on one line, against 286 px of content at 360. So the header must become two rows, and
something has to give.

**Decision: the Follow-along label does NOT collapse to an icon. The word "Speed" goes instead.**

- Follow-along is a *stateful* control: an unlabelled checkbox (or an icon toggle) has to be learned.
  Its 17 px box is a native affordance readers already recognise, and its label is the only thing
  explaining what "following" means.
- Speed is a `<select>` showing `1x`. The value is self-describing; the word "Speed" is redundant
  next to it. Dropping it frees 42 px and keeps an unambiguous control.
- The card's hypothesis (icon-only Follow-along) was the wrong thing to sacrifice. Measurement made
  that clear: row 2 is the cheap row, and the Speed word is the cheapest thing on it.

**Resulting two-row form** (`@container (max-width: 559px)`) — a real 2 × 2 grid, not `flex-wrap`:

```
┌────────────────────────────────────────────┐
│ LISTEN TO THIS LESSON                 1x ▾ │   row 1: identity + setting
│ ☑ Follow along                  Mark complete │   row 2: the two actions
├────────────────────────────────────────────┤
│ [ native <audio> — width 100% ]            │
└────────────────────────────────────────────┘
```

| Measured at 360 (content 286) | width |
| --- | --- |
| Row 1 label column (`minmax(0,1fr)`; the text itself measures 155) | 210 (55 px headroom) |
| Row 1 Speed column (pinned 64 px; a native select reserves its widest option otherwise) | 64 |
| Row 2 Follow-along (17 px box + label, 44 px tall) | 104 |
| Row 2 action slot | 144 |
| Row 1 total / Row 2 total (gap 10) | 284 of 286 / 258 of 286 |

The action slot is the row's right edge — the thumb corner, directly above the audio it completes.
At 390 the same grid has 30 px more room and behaves identically.

---

## 4. Short viewport — landscape 844 × 390

A 390 px-tall viewport cannot afford a two-zone bar: stacked, the bar is **140 px** and leaves **194 px**
of reading area under the 56–64 px site header — 36 % of the viewport gone.

`@media (orientation: landscape) and (max-height: 480px)` collapses the card to **one row**:
`display: contents` dissolves the header block and the `<audio>` moves inline, between the label and
the transport controls.

```
[ ▮▮▮ (mark)  [ native <audio> — flex 1, min 280 ]  ☑ 1x ▾ │ Mark complete ]
```

| 844 × 390 | stacked | compact |
| --- | --- | --- |
| bar height | 140 px | **72 px** |
| reading area under the bar | 194 px | **262 px** |
| audio width | 768 px | 372 px (the documented exception) |
| action slot | 144 × 44 | 144 × 44 (unchanged) |

+68 px of reading area (+35 %). The label's text goes visually hidden in this mode; the three-bar
audio mark stays as the identity. The audio keeps a **280 px floor** — below that the browser starts
dropping native controls, which is why this is the only place the audio shares a row.

---

## 5. The slot contract (this is what makes it safe)

The action slot is a **fixed 144 × 44 box at every breakpoint**. The button fills it (143 × 44 at
desktop, 140 × 44 in the two-row form); the chip sits inside it, right-aligned.

```html
<!-- incomplete -->
<div class="ab-complete">
  <button type="button" class="mc-btn">
    <svg …circle+check, 16px, aria-hidden></svg><span>Mark complete</span>
  </button>
</div>

<!-- complete -->
<div class="ab-complete">
  <span class="mc-chip" role="status" tabindex="-1">
    <svg …check, 11px, aria-hidden></svg>Completed
    <span class="visually-hidden"> — change this in the lesson header</span>
  </span>
</div>
```

```css
.ab-complete {
  display: flex; align-items: center; justify-content: flex-end; flex: 0 0 auto;
  /* 144, not 143: the button's intrinsic width is 143.2px, so a 143 minimum let
     the slot breathe 0.2px between states and the compact audio absorbed it. */
  min-width: 144px; min-height: 44px;
}
.ab-complete > .mc-btn { max-width: 100%; }   /* the button can never widen the slot */
.mc-btn  { height: 44px; min-height: 44px; min-width: 44px; padding: 0 14px 0 11px;
           border: 1px solid var(--line-strong); border-radius: 10px; background: var(--card);
           color: var(--navy); font: 600 13px/1 var(--font-sans); }
.mc-chip { height: 30px; padding: 0 11px; border-radius: 999px; background: var(--ok-bg);
           border: 1px solid var(--ok-line); color: var(--ok);
           font: 700 10.5px/1 var(--font-sans); letter-spacing: .07em;
           text-transform: uppercase; cursor: default; }
```

**Why the fixed slot is not optional.** Measured before the fix: in the compact landscape form the
audio element jumped **372 → 402 px** when the button (143) was replaced by the chip (113), because the
slot was sized by its content. A 30 px reflow of a media element on "Mark complete" is exactly the kind
of unearned motion this card exists to avoid. With the slot pinned, the shift is **0 px at all four
viewports** and the audio element never moves or resizes.

The `min-height: 44px` on the slot matters for a second reason: when a lesson has no timings manifest
the Follow-along control is not rendered, so in the two-row form the chip is alone on row 2. Without
the slot's own min-height, that row would collapse from 44 px to 30 px.

---

## 6. States

| State | Renders | Notes |
| --- | --- | --- |
| default | outlined button, navy label | 16.8:1 on white |
| hover | border → `rgba(11,29,58,.42)`, surface → `--sunken` | no lift, no shadow |
| focus-visible | 2 px `--red`, 2 px offset | site convention, never removed |
| pressed | fill → `--line` | instant; no scale (it would fight the dock's shadow transition) |
| hydrating | `disabled` + `aria-disabled="true"`, opacity .45, `cursor: progress` | while `useLessonProgress.isLoading`; label unchanged, no spinner in a 44 px target |
| complete | static chip | `cursor: default`, no hover, no toggle |
| no narration | no bar | `AudioPlayer` returns null (existing) |
| signed out | locked card | unchanged, existing |

There is no error state in the control. The write is optimistic through the hook: a failed POST leaves
the chip in place and the localStorage fallback already holds the truth, which is the existing
behaviour of the hero control. Do not add a spinner or an error toast to the bar.

---

## 7. Accessibility

- **Name** — the visible text is the accessible name: "Mark complete". Do not add an `aria-label` that
  would change it.
- **Target** — 143 × 44 (button) inside a 144 × 44 slot, at every breakpoint including the compact
  landscape row. Never below 44 × 44.
- **Announcement** — the chip is `role="status"`, a polite live region. Its visually hidden suffix
  ("— change this in the lesson header") tells the reader where the toggle lives. **Do not add a second
  live region** — one mechanism, one announcement.
- **Focus** — the pressed button is removed from the DOM by the swap. Give the chip `tabindex="-1"` and
  move focus to it on completion, so keyboard and screen-reader users are not dropped back to
  `<body>` in the middle of a lesson. `tabindex="-1"` keeps it out of the tab order, so the next Tab
  still lands on the article. The move is for **the reader's own press only**: an already-completed
  lesson loading (the hook starts `false` for hydration safety, then flips `true` on mount) and a
  same-tab/cross-tab progress sync must NOT move focus or announce the live region.
- **Follow-along when the label hides** (compact landscape) — the input keeps `aria-label="Follow along"`;
  the 17 px box is `opacity: 0` but stays in the accessibility tree and keeps `:focus-visible` on the
  visible `.box` via `input:focus-visible + .box`.
- **Contrast** — button 16.8:1 light / 14.0:1 dark; chip 5.2:1 light (#047857 on #ECFDF5) and 9.1:1
  dark (#6EE7B7 on `#12303a` — the alpha-blended chip fill over the `#121a2e` card, not over the page).
  Chip text is small (10.5 px) so it must stay bold and at AA; it does.

---

## 8. Motion

**None on the state change, in any motion mode.** Button → chip is a DOM swap with no transition, no
scale, no crossfade. That is the cheapest possible answer to `prefers-reduced-motion`: there is nothing
to suppress, so the behaviour is identical for every reader.

The only motion in the bar is:

- 120 ms border/background transitions on hover and press, which the global rule in
  `src/app/globals.css` (`transition-duration: .01ms !important` at the `prefers-reduced-motion: reduce`
  blocks, lines 683 and 1247) already neutralises — and which the sheet also pins with an explicit
  `transition: none !important` on the control, so the guarantee does not depend on load order;
- the optional three-bar audio mark, guarded by `@media (prefers-reduced-motion: no-preference)`, so
  it never animates for reduced-motion readers.

The page-level confirmation of completion is the existing constellation celebration
(`LessonCelebration`), which owns its own motion budget. The bar does not add a second moment.

---

## 9. Tokens

All lifted from `src/app/globals.css` — nothing invented.

| Token | Value | Used for |
| --- | --- | --- |
| `--navy` | `#0B1D3A` | button label, identity text, chip in dark |
| `--red` | `#C8102E` | focus ring, audio mark |
| `--line-strong` | `#D1D5DB` | button border, select border |
| `--sunken` / `--line` | `#F3F4F6` | hover surface / pressed fill |
| `--muted` | `#6B7280` | label, Follow-along, Speed |
| `--ok` / `--ok-bg` / `--ok-line` | `#047857` / `#ECFDF5` / `#A7F3D0` | completed chip |
| radius | `10px` button, `999px` chip, `8px` select | |
| type | Inter 600 13 px (button) · 700 10.5 px .07em caps (chip) | |

---

## 10. Measured evidence

Read from the live DOM of `design/mockup-sticky-complete.html` (each specimen is laid out at its true
CSS width; the sheet scales only visually). Incomplete → complete, per viewport:

| Viewport | Content | Bar | Header rows | Audio | Slot | Button | Chip | Bar shift | Audio shift |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1280 | 848 | 140 | 1 | 846 | 144 × 44 | 143 × 44 | 113 × 30 | 0 | 0 |
| 390 | 316 | 188 | 2 | 314 | 144 × 44 | 140 × 44 | 113 × 30 | 0 | 0 |
| 360 | 286 | 188 | 2 | 284 | 144 × 44 | 140 × 44 | 113 × 30 | 0 | 0 |
| 844 × 390 | 778 | 72 | 1 | 372 | 144 × 44 | 143 × 44 | 113 × 30 | 0 | 0 |

Fractional check on the same run: the audio's sub-pixel width is identical in both states at all four
viewports (846.000 / 314.000 / 284.000 px, and 371.523 px in the compact form) — a delta of 0.0000,
not just a rounded zero.

Reading area under the pinned bar (frame height − site header − bar):

| Viewport | Reading area |
| --- | --- |
| 1280 × 620 | 424 px |
| 390 × 640 | 396 px |
| 360 × 640 | 396 px |
| 844 × 390 | 262 px (194 px if stacked) |

The sheet prints these numbers live under each specimen and re-checks, on load and on every state
switch: slot ≥ 44 × 44, audio full width (desktop / portrait), no label/Speed and no
Follow-along/control collision, and zero bar-height or audio-width shift across the swap.

---

## 11. Handoff to steel

**Files**

- `src/components/BlogPost/AudioPlayer.tsx` — add the slot to the header row; add the two-row and
  compact rules. Article usage (field-notes) passes no `lessonSlug` and keeps today's bar exactly.
- `src/components/BlogPost/AudioPlayerLazy.tsx` — thread the new optional prop through the dynamic
  import boundary (it is a plain pass-through today).
- `src/app/atlas/[series]/[slug]/page.tsx` — pass `lessonSlug={slug}` into `AudioPlayerLazy`.
- `src/app/globals.css` (or a co-located module) — the rules below. They are plain CSS, not utility
  classes: the layout spans a container breakpoint and a media breakpoint, and mixing the two in
  utilities produces the `flex-wrap` accident this card exists to remove.

**Props** (as implemented in A8, t_1975dec0)

```ts
interface AudioPlayerProps {
  slug: string;
  hasAudio?: boolean;
  label?: string;
  /**
   * Optional control at the end of the header row, inside the fixed slot.
   * The lesson page passes <MarkCompleteCompact lessonSlug label />;
   * article pages pass nothing and render no slot.
   */
  trailing?: ReactNode;
}
```

The control itself lives in `src/components/Progress/MarkCompleteCompact.tsx` (same
`useLessonProgress` hook, same write path). The player carries the `.has-trailing` modifier that
scopes the two-row and compact rules below.


**Wiring** (there is exactly one write path)

```tsx
const { isCompleted, markComplete, isLoading } = useLessonProgress(lessonSlug ?? "");
// render the slot only when lessonSlug is defined
// onClick: only ever call markComplete() when !isCompleted
```

**Layout rules**

```css
/* one row by default: label · follow · speed │ slot */
.ab-head { display: flex; align-items: center; gap: 8px; }
.ab-label { margin-right: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ab-audio { display: block; width: 100%; }          /* block sibling — header can never narrow it */

/* the bar responds to ITS OWN width, not the viewport (it lives in a max-w-[920px] column) */
.audio-dock { container-type: inline-size; }

@container (max-width: 559px) {                      /* ≈ viewport 640 */
  .ab-head { display: grid; grid-template-columns: minmax(0,1fr) 64px;
             grid-template-areas: "label speed" "follow complete"; gap: 4px 10px; }
  .ab-label  { grid-area: label; }
  .ab-speed  { grid-area: speed; }
  .ab-speed .sfl { display: none; }                  /* the word "Speed" — the value is enough */
  .ab-speed select { width: 100%; }
  .ab-follow { grid-area: follow; justify-self: start; }
  .ab-complete { grid-area: complete; justify-self: end; }
}

@media (orientation: landscape) and (max-height: 480px) {
  .audio-card { display: flex; align-items: center; gap: 10px; padding: 8px 12px; }
  .ab-head { display: contents; }                    /* dissolve the header block */
  .ab-audio { flex: 1 1 auto; min-width: 280px; width: auto; }
  .ab-complete { margin-left: auto; }
}
```

**Pitfalls found while designing (all measured, do not re-learn them)**

1. A native `<select>` reserves its widest option for intrinsic sizing (142 px here), which starves the
   label column in the grid. Pin the column to 64 px and let the select fill it.
2. Sizing the action slot by its content makes the audio element jump 30 px on completion in the
   compact form. The slot is fixed at 144 × 44 (not 143 — the button's intrinsic width is 143.2, so a
   143 minimum leaves a 0.2 px breathing difference the audio absorbs). This is the whole reason the
   control is safe.
3. `flex-wrap` at 360 produces a third row at some widths. The two-row form must be an explicit grid.
4. `container-type: inline-size` on the dock (not on the card's parent chain) is what makes the
   breakpoint track the bar's real width; a viewport media query would mis-fire the moment the dock
   changes column.
5. The compact, non-compact and complete states must all be re-measured after any padding change: the
   thresholds in this document are padding-derived (16 px card padding, 20–24 px page gutters).

**Do not**

- Do not add a toggle, a second live region, a spinner, or an error toast to the bar.
- Do not read `isCompleted` from `localStorage` in the initial render (hydration: the existing hook
  deliberately starts `false` and syncs after mount — keep that).
- Do not let the completed state change the bar's height or the audio's width.

---

## 12. Acceptance — mapped to the card

| Requirement | Where | Status |
| --- | --- | --- |
| Control lives in the header row | §5, specimen 1280 | done |
| Incomplete: button "Mark complete" ≥ 44 × 44 | 143 × 44 measured, in a 144 × 44 slot | done |
| Does not shrink the audio element | audio 846 of 848 content at 1280 (block sibling); 0 px shift across the swap | done |
| Complete: static chip, no toggle | `<span role="status">`, cursor default, no hover | done |
| 360/390: two-row layout resolved and shown | §3 + specimens 360 / 390 | done |
| Follow-along collapse decision made | §3 — **no**, the Speed word goes instead | done |
| 844 × 390: compact form, reading area not eaten | §4 — 140 → 72 px bar, 194 → 262 px reading | done |
| Reduced motion: no animated state change | §8 — the swap has no animation at all | done |
| No gating | §1 | done |
| Existing completion endpoint, one write path | §11 — `useLessonProgress` → `POST /api/progress/lesson` | done |

## 13. Out of scope

- Un-marking from the bar (stays on the hero control, by design — this card asked for a completion
  affordance, not a second toggle).
- Any change to the guest card or to the no-narration case.
- The constellation celebration's own motion.
- Dark mode is drawn on the sheet (same two states) because the site ships it, but the card does not
  require new dark tokens — the existing `--ok` / `--ok-bg` / `--ok-line` set already covers it.
