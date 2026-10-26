# K1 — Knowledge check as a milestone node in the syllabus timeline

**Card:** `t_52d6b285` · **Design only** — no implementation in this card.
**Surface archetype:** Operate / Monitor (a progress-bearing lesson list, not a marketing surface).
**Deliverables:** this spec + `design/mockup-check-node.html` (component CSS lives in that file and is the handoff to Steel).
**Screenshots:** `design/screenshots/k1-node-360x800.jpg`, `k1-node-390x844.jpg`, `k1-node-768x1024.jpg`, `k1-node-1024x768.jpg`, `k1-node-1280x800.jpg`, `k1-full-list-1280.jpg`.

---

## 1. The problem this solves

The checks exist today but sit in their own section at the **bottom** of the course page
(`CheckCardList` → "Milestone checks"). A learner does not know a check exists until they have
finished every lesson. Chris's requirement: the check covering lessons 1–5 is what the learner is
directed to when they finish lesson 5; on passing they continue to lesson 6.

**Decision:** the check becomes a **node in the lesson list**, between lesson 5 and lesson 6. The
bottom "Milestone checks" section is removed. The exam card that followed it stays at the page
bottom — out of scope for this card.

A check is a **milestone, never a door**. There is no locked state, no locked badge, no locked copy,
no gating treatment anywhere in this design.

---

## 2. Placement rule (the part that is easy to get wrong)

The node is anchored to the **boundary between lesson B and lesson B+1**, on the side nearest B:

| List order | Position of `Knowledge Check 1 · Lessons 1–5` |
|---|---|
| Ascending (default) | after lesson 5, before lesson 6 |
| Descending (`?sort=desc`) | after lesson 6, before lesson 5 |

Other rules Steel needs:

- The node renders even when lesson B+1 is not published yet — it sits just before the "Coming
  soon" block. Discoverability must not depend on the next lesson existing.
- The node stays visible when "Hide completed" is on. It is a milestone, not a completed item; the
  filter hides lessons only.
- If `checksMeta` is empty (a series with no checks), no node renders — nothing else changes.
- One node per check. With 6 checks the list carries 6 milestone bands, each at its own boundary.

---

## 3. Anatomy

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 2px rule  (navy when Available · emerald when Passed)                    │
│ ┌────┐                                                                   │
│ │ ◇  │  Knowledge Check 1 · Lessons 1–5            [ ▸ Available ]        │
│ │ K1 │                                                                   │
│ └────┘                                                                   │
│ 2px rule                                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

1. **Marker — a 40 px diamond.** A 28 px square rotated 45° with a 2 px border; `K1` sits
   counter-rotated inside. It is deliberately *not* a rounded navy plate: lesson plates are solid
   navy rectangles with a red number and the word "LESSON"; the check is a **junction in the path**,
   so it gets the milestone glyph. Same 40 px optical height as a lesson plate, so the rows keep
   their rhythm.
2. **Label — `Knowledge Check N · Lessons A–B`.** 14 px / 600 at < 560 px container, 15 px / 600
   above. Wraps; never ellipsised. Copy is fixed — the label comes from the check metadata and the
   explanatory line from `examLabels(kind).unlockNote()`. Lois owns wording; this design changes no
   strings.
3. **State badge — text **and** icon, never colour-only.** 11 px mono 700, uppercase tracking .03em,
   pill, `white-space:nowrap`, `flex:none`:
   - `Available` — start glyph (circle + chevron), navy ink on a 5% navy tint, 22% navy border.
   - `Passed · 87%` — tick glyph, emerald-800 ink on a 12% emerald tint, 32% emerald border.
   The icon carries the state; colour only reinforces it. Both states are AA-contrast on their band.
4. **Band.** 2 px top and bottom rules (the list's normal divider is 1 px) plus a 3.5% navy tint
   (5.5% emerald when passed). This is the "milestone emphasis": heavier rules and a tinted band,
   not a badge-only colour change. It must never look disabled — ink stays at full contrast.
5. **The explanatory line lives once per syllabus, not per node.** `unlockNote()` is exam-level copy
   ("The timed course completion exam opens once every knowledge check is passed at 80% or higher.").
   Repeating it inside every milestone row added ~60 px per node at 360 px and read as noise. It
   renders once as `.syl-note` under the list, and each node's anchor points at it with
   `aria-describedby`. This is the copy that replaces the deleted section's paragraph.

---

## 4. Layout and the non-negotiables

| Constraint | How it is met |
|---|---|
| Row height ≥ 44 px at every width | `min-height:64px` + 12 px padding. Measured: **68 px** at 768/1024/1280, **99 px** at 360/390 (badge drops to a second line). |
| Badge must not be colour-only | Inline SVG icon + text in both states. |
| No fixed min-width; no horizontal scroll at 360 px | The only fixed track is the 40 px marker. Label is `minmax(0,1fr)`; badge column is `auto` with `white-space:nowrap`. Measured `scrollWidth == clientWidth` in every frame. |
| Long range labels must not truncate the state badge | Below 560 px the badge moves to its own row under the label, so a long range can never compete with it. At ≥ 560 px the badge sits in its own `auto` column. No `text-overflow` anywhere on this component. |
| Discoverable on first view, zero progress | The node is in normal flow — no collapse, no `hidden`, no progress-gated render. The same markup paints for guests and for zero-progress learners; the default state is `Available`. |
| Milestone emphasis | 2 px rules vs the 1 px lesson hairline, tinted band, diamond marker, heavier label. |

### Breakpoint behaviour

| Container width | Composition |
|---|---|
| < 560 px (360, 390) | marker + label on row 1; badge on row 2, left-aligned under the label. Height ≈ 99 px. |
| ≥ 560 px (768, 1024, 1280) | marker · label (`1fr`) · badge (`auto`, right-aligned, vertically centred). Height = 68 px. |

Container queries (`container-name: syllabus`), not viewport media queries — the syllabus sits in a
1120 px shell on desktop and full-bleed on mobile, so the component must respond to *its* width.

### Divider collision

The lesson row above already paints a 1 px bottom border. The node's 2 px top rule would double it.
Rule: when a lesson row is immediately followed by a node, that lesson's bottom border is set to
`transparent` (in React: the row at `indexOfNode - 1` gets `border-b-0`). The node's 2 px rule then
does the separating work.

---

## 5. Tokens

Everything is derived from the existing `globals.css` palette — navy `#0B1D3A`, red `#C8102E`,
emerald status green. The node only adds the `--mn-*` group (defined per state in the mockup):

```css
/* Available (default, zero progress, guest) */
--mn-tint: rgba(11,29,58,0.035);      --mn-tint-hover: rgba(11,29,58,0.065);
--mn-rule: rgba(11,29,58,0.50);
--mn-mark-border: rgba(11,29,58,0.45); --mn-mark-bg: transparent; --mn-mark-ink: #0B1D3A;
--mn-label: #0B1D3A;
--mn-badge-bg: rgba(11,29,58,0.05);   --mn-badge-border: rgba(11,29,58,0.22); --mn-badge-ink: #0B1D3A;

/* Passed */
--mn-tint: rgba(16,185,129,0.055);    --mn-tint-hover: rgba(16,185,129,0.10);
--mn-rule: rgba(4,120,87,0.50);
--mn-mark-border: #047857;            --mn-mark-bg: #047857; --mn-mark-ink: #FFFFFF;
--mn-badge-bg: rgba(16,185,129,0.12); --mn-badge-border: rgba(4,120,87,0.32); --mn-badge-ink: #065F46;
```

Dark surface overrides are in the mockup (`.on-dark` / `[data-theme="dark"]`). There is no locked
token, by design.

---

## 6. Interaction and accessibility

- The whole node is one link to `/atlas/{series}/check/{n}`. The explanatory note sits **outside** the
  anchor and is referenced with `aria-describedby`, so the link name stays short.
- Anchor label: `Knowledge Check 1, lessons 1 to 5, available` / `… passed with 87 percent`.
- Hover / focus-within: band tint deepens, diamond fills (navy → solid navy; emerald → emerald-800),
  `K1` inverts to white. 160 ms `ease`; removed under `prefers-reduced-motion`.
- Focus: 2 px red ring, offset −2 px on the band so it is visible against the tint.
- No load animation and no pulse — a milestone is not a live signal.
- Dark mode: rules `rgba(148,163,184,.50)`, label `#E6EDF7`, badge tint white/7%.

---

## 7. What Steel changes (scope boundary)

1. `SeriesSyllabus` — inject the node at the B/B+1 boundary in both sort directions; suppress the
   preceding lesson's bottom border; keep the node visible under "Hide completed".
2. `CheckCardList` — **delete the section** (heading, kicker, paragraph, card). Its one job — the
   explanatory line — moves to `.syl-note` under the list.
3. The node needs `checksMeta` (`n`, `lessons[0]`, `lessons[1]`) and the learner's best score for the
   matching check. Passed state requires no new endpoint: `/api/progress/quiz/tiers` already returns
   `bestScore` and `passed`.
4. States map as: `passed → Passed · {bestScore}%`; anything else (`attempts > 0` but not passed, or
   no attempt, or guest) → `Available`. The old "Not taken" and "% · retake" variants are gone.

**Not in this card:** the check page itself, the exam card, the constellation chart.

---

## 8. Evidence

Measured live in the mockup (not hand-typed), across 360×800, 390×844, 768×1024, 1024×768,
1280×800 and 1280×940:

| Frame | Node height | Frame h-scroll | Badge | Label lines |
|---|---|---|---|---|
| 360 × 800 | 99 px | none | intact | 1 |
| 390 × 844 | 99 px | none | intact | 1 |
| 768 × 1024 | 68 px | none | intact | 1 |
| 1024 × 768 | 68 px | none | intact | 1 |
| 1280 × 800 | 68 px | none | intact | 1 |
| 1280 × 940 · full list | 68 px | none | intact | 1 |

Visual checks on the rendered mockup: at 360 the row reads as a milestone band (diamond `K1`, label,
badge beneath), not a disabled row; at 1280 the trailing badge is right-aligned and legible.

---

## 9. Open questions for Lois (copy only — design does not block on these)

- The diamond carries only `K1`. If Lois wants a unit word (e.g. `CHECK`) set beneath the number,
  that is an additive change inside the 28 px square — confirm the fit at 360 px first.
- The badge's `Available` icon is a "start" glyph. If the product wants "not yet attempted" to read
  differently from "ready to start", that is a copy/icon swap, not a layout change.
