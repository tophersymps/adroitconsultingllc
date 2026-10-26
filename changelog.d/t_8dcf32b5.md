### "Mark complete" control in the lesson sticky audio bar (t_8dcf32b5)

**What** - Added a "Mark complete" control to the header row of the lesson audio bar
(`src/components/BlogPost/AudioPlayer.tsx`). An incomplete lesson shows a 143×44 "Mark complete"
button inside a fixed 144×44 action slot; a complete lesson shows a static 113×30 "Completed" chip
(`role="status"`, `tabindex="-1"`, focus moved to it after the swap) inside the same slot, so the swap
never resizes the bar or the `<audio>` element. Threaded an optional `lessonSlug` prop through
`AudioPlayerLazy` and passed it from the lesson page. The control uses the single existing write path
(`useLessonProgress` → `POST /api/progress/lesson`); un-marking stays on the hero `MarkComplete`
control. Added the responsive layout in `src/app/globals.css`: a container-query 2×2 grid at ≤559px
(the word "Speed" collapses, the Follow-along label is kept) and a 72px single-row compact strip at
`orientation: landscape and max-height: 480px`, both scoped to `.has-complete` so the article
(field-notes) bar is unchanged.

**Why** - Wave 2 Learn UX (K2 of 19). The lesson reader needed a completion affordance in the Operate
surface (the sticky bar) without gating, without a second toggle, and without unearned motion: a
content-sized slot made the compact audio jump 30px on completion, which the fixed slot eliminates
(0px shift at 1280/390/360/844×390 per the design sheet).

**Verified** - `npx vitest run src/components/BlogPost/AudioPlayer*.test.tsx` (34 tests pass, including
6 new completion-control tests and the 28 existing audio-player tests); `npm run lint`; `npm run build`;
the two states were confirmed in a browser against the design specimen.

**Known Issues** - The design's three-bar equaliser mark and custom 17px Follow-along checkbox are not
implemented (outside this card's scope; the article bar keeps its native controls). The base header gap
is the design's 8px rather than the prior 12px. The completed chip's border uses a hardcoded
`rgba(4,120,87,.22)` (light) / `rgba(52,211,153,.32)` (dark) rather than a named `--signal-done-line`
token.
