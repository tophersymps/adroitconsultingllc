# Adroit Blog — Design Discovery: Motion System + Progress UI + Quiz UI

**Task:** t_7e4e4898 · **Author:** kara (designer) · **Date:** 2026-08-06
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Parent:** t_8f4504ca (BA — Life & Depth requirements) · **Child (execution):** t_bd445853
**Type:** DISCOVERY — direction + tokens + mood boards. The EXECUTION task (sonnet-5) composes the mockups from this brief.

---

## 0. What This Discovery Covers

Three connected systems, one shared language:

1. **Site-wide motion system** — Epic B (interaction polish): "between subtle and playful — alive but professional"
2. **Progress tracking UI** — Epic D: read/unread on posts, "Mark as read", "Mark complete", user-driven series progress
3. **Interactive quiz UI** — Epic E engine: client Quiz component + series quiz stats

Builds **ON** the shipped design pass (t_e3c87690 chain): shadow-card / shadow-card-hover / shadow-glow-* tokens, article-body typography, navy #0B1D3A + red #C8102E palette, Inter + mono stack, rounded-xl cards. Nothing from that pass is redone.

---

## 1. Surface Archetypes (committed before tokens)

| System / component | Surface | Why |
|---|---|---|
| Motion language (global) | **Cross-cutting — no surface of its own.** It *serves* the host surface: Explore (blog/learn grids), Decide/Learn (post/lesson detail), Monitor (progress rows). | Motion is glue, not a page. Every motion rule is justified by "does this clarify state change / give tactility?" |
| Read/unread on PostCard | **Monitor** (embedded in Explore grid) | The card is a browse target, but the read state is a status signal — dimmed card + check badge must be *glanceable*, not decorative |
| "Mark as read" button (post page) | **Operate** (primary) inside Decide/Learn | One explicit action with a clear completed state; button must read as a control, not a link |
| All/Unread/Read filter toggle | **Operate** | Selection state dominates — segmented control, not pills+dropdown |
| Series progress (learn hub + series page) | **Monitor** | Watching state change (completion %) — the bar/counter is the hero signal, no marketing framing |
| "Mark complete" per lesson | **Operate** | Explicit per-row action with optimistic check state |
| Quiz component | **Operate** (primary) + Decide/Learn for explanation reveal | Answering = operating on options (selection state dominates); the explanation panel after grading is a learning moment |

**Anti-slop consequence:** the quiz is NOT a hero + three feature cards. It is a focused Operate surface: question header, option list with radio-style selection, one submit affordance, then feedback. The progress row is a Monitor signal — thin bar + mono counter, not a monument stat.

---

## 2. The One-Line Direction

> **"Alive, not animated."** A motion and progress language that makes the blog feel responsive and rewarding — short, purposeful transitions everywhere; springs reserved for *accomplishment moments* (read check, lesson complete, quiz grade). Progress states speak in the existing brand voice: red fill + mono counters for motion, emerald check only for *done*.

Reference vocabulary (from popular-web-designs):
- **Framer** (motion-first system): accent color only on *interactive* elements; pill-shaped interactive affordances; compression/tracking as personality — we keep our navy/red but borrow the "accent = interactive only" discipline.
- **Notion/Mintlify** (content + learning): quiet progress presentation, no gamification; the UI recedes so the content leads.

---

## 3. Motion System — Rules, Not Randomness

Chris's brief: *between subtle and playful* — short transitions, lifts, underlines, selective micro-motion; respect the existing `prefers-reduced-motion` block in globals.css (already present — keep it, extend nothing).

### 3.1 Motion postures (three speeds, one language)

| Posture | Duration | Easing | Use |
|---|---|---|---|
| **Micro** | 120–150ms | `ease-out` | Color, underline draw, icon swaps, button press (`active:scale-[0.98]`) |
| **Standard** | 200–250ms | `ease-out` (quartic feel) | Card hover lift, arrow slide, filter switch, checkbox fill |
| **Moment** | 400–550ms | spring / `cubic-bezier(0.34, 1.56, 0.64, 1)` | **Accomplishment only:** checkmark pop, lesson complete, quiz grade + explanation reveal, score ring fill |

Rule: **Micro/Standard are everywhere; Moment is earned.** If a spring appears on a non-accomplishment element, that's over-motion — remove it.

### 3.2 What moves (component-level rules)

**Always (Micro/Standard):**
- Hover lift: cards `-translate-y-1` (already in pass) — keep, standardize to `duration-200 ease-out`
- Underline draw: article links — `background-size` or `text-decoration-color` transition (already partially done; make it a token)
- Arrow slide: "Read more →" `translate-x-0.5` (already done — keep)
- Image zoom: banner `group-hover:scale-[1.03]` with `duration-500 ease-out` (already done — keep)
- Focus-visible: red ring (already done — keep)
- Progress bar fill: `transition-[width] duration-300 ease-out` (already done — keep)
- Buttons/pills: press feedback `active:scale-[0.98]` + bg transition

**New (selective micro-motion — the "playful but professional" layer):**
- **Pulse dot** — extend the existing featured "Live/pulse" dot pattern to: unread indicator on cards? NO — unread is static (see 4.1). Pulse stays reserved for "NEW" badges + live/featured markers.
- **Read check pop** — when "Mark as read" completes, the check draws in with a small spring (`scale 0.6 → 1` + stroke draw). This is the *signature* accomplishment motion.
- **Lesson complete check** — same spring family, smaller amplitude.
- **Quiz feedback** — correct option: green ring + check springs in; wrong option: gentle red flash (not shake — shake is hostile). Explanation panel slides/fades in (`opacity + translateY(8px)`, 350ms).
- **Score ring** — stroke-dashoffset animates to the final value on results reveal (400ms ease-out), counter (tabular-nums) ticks up.

**Never:**
- No bounce-in on page load, no parallax, no marquee, no auto-playing loops
- No motion on hover that delays reading (tooltips must be instant)

### 3.3 Reduced motion

Existing globals.css block already zeroes animation/transition/transform. **Do not change it.** All new motion uses CSS transitions/animations so the block covers it automatically. If steel implements any WAAPI/JS animation, it MUST check `matchMedia('(prefers-reduced-motion: reduce)')` and skip. Quiz feedback under reduced-motion: show color states only, no movement.

---

## 4. Progress Tracking UI — Direction

### 4.1 Read/unread on blog post cards (Monitor-in-Explore)

- **Unread (default):** unchanged current card.
- **Read:** the *whole card* dims subtly — banner `opacity-60`, title `text-gray-400`, excerpt `text-gray-400`, border `gray-100`. NOT a heavy grey-out (must stay scannable), and NOT a colored strip. A small **emerald check badge** sits top-right over the banner (white circle + green check, or green chip with mono "read" — execution task picks; recommend white circle + check for scanability).
- Check badge gets the **Moment spring** on state change only.
- The card is still a link — clicking re-reads it (no "unread" toggle on the card itself; that lives on the post page).

### 4.2 Filter toggle (Operate)

- Segmented control in the category-pill row: **All / Unread / Read**, styled consistently with existing pills (active = navy bg white text) but as one segmented group with a mono count badge per segment.
- Behavior: `?read=unread|read|all` URL param alongside `category` + `sort`. Pagination resets on filter change.
- Empty state: "No unread posts — you're all caught up ✨" — wait, NO emoji (anti-slop). Use: "No unread posts in this category." + subtle illustration-free text, consistent with existing EmptyState language.

### 4.3 "Mark as read" button (post page, Operate)

- Placement: in the post meta row (top, near share) AND a sticky/bottom CTA after the article body for long-form. Two affordances, one action.
- **Unread state:** outline pill (border navy, text navy, small "Mark as read" + circle icon).
- **Read state:** navy solid pill with emerald check icon + "Read" (or "Mark as unread" ghost link beside it for undo). The completion transition = Moment spring check pop.
- Guest mode: works immediately, writes localStorage, shows subtle "Saved on this device" note on first action. Signed in: writes Supabase, note becomes "Synced across devices" with a tiny check.

### 4.4 Lesson "Mark complete" (Learn, Operate)

- **LessonCard** gains a trailing circular check control (48px touch target): empty circle → filled emerald check on complete. Clicking it completes/undoes *without navigating* (stopPropagation on the Link).
- Completed lessons: sequence badge keeps red (brand), title gets `text-gray-400` + strikethrough? NO — strikethrough is hostile; use dimmed title + emerald check. Current lesson (first uncompleted in order) gets a subtle "You are here" pulse dot or red left indicator — execution task chooses; recommend a small red dot + mono "current".
- Optimistic update: check fills immediately, syncs to Supabase in background; on failure, revert + toast.

### 4.5 User-driven series progress (Monitor — replaces/augments LessonProgress)

- **Two layers, one bar.** The existing content metric (published vs total) stays as the thin red bar + mono "Lesson N of M" (it's the *content* signal). The NEW user progress is a **second, distinct row**: emerald-tinted thin bar or segmented dots showing completed/total, with mono counter "3 of 8 complete". Different color (emerald), different label language ("complete" vs "published") so they can never be confused.
- On the series header strip (onGradient variant): user progress row gets white/emerald treatment on the gradient, content metric stays white.
- Percent = completed lessons / total lessons (total = series.totalLessons, not just published — completed can only apply to published lessons, so clamp).
- **Replaces or augments?** Recommendation: **augment** — content metric is the "what's here" signal, user progress is "what you've done". Both are glanceable; two thin bars side by side read fine. If steel finds space constraints on PathCard, the content metric can collapse to a mono count and the user bar becomes primary. Execution mockups should show the two-bar version.

### 4.6 States to cover (all components)

- Loading (Supabase fetch): skeleton shimmer on bars/cards — reuse the standard shimmer (`animate-pulse` on gray-100 blocks is fine; no new shimmer token needed)
- Empty: no posts / no unread / no lessons in series (existing EmptyState)
- Error: Supabase unreachable → graceful fallback to localStorage + non-blocking banner ("Progress is saving locally — we'll sync when you're back online")
- Guest vs signed-in: badge/note states (4.3)
- Optimistic + revert

---

## 5. Interactive Quiz UI — Direction (Epic E engine)

### 5.1 Data shape (from BA + arch decisions)

- **Sidecar `questions.json`** per lesson (`content/learn/<series>/<slug>/questions.json`) — Jimmy generates; `src/lib/quiz.ts` loads + types it. Question = `{ id, q, options: string[], answer: "A"|"B"|"C"|"D", explanation }`.
- Client `<Quiz>` component renders from that JSON; records to `quiz_attempts` + `quiz_answers` via Supabase (fallback localStorage in guest mode).

### 5.2 Layout (Operate surface — focused, not decorated)

```
[Lesson title area — the quiz sits after article content]
┌─────────────────────────────────────┐
│ QUIZ — mono kicker + red tick        │  (matches section-header language)
│ Question 2 of 5                       │  (mono, tabular)
│ "Which of the following…"  ← text-lg  │  bold navy
│ ┌─ ○ Option A  ────────────────────┐ │  option rows: white bg, gray border,
│ ├─ ○ Option B                     │ │  rounded-xl, min-h-11, hover: border-navy
│ ├─ ● Option C  (selected state)    │ │  selected: navy border + navy ring
│ └─ ○ Option D                     └─┤
│        [ Submit answer ] (disabled until selection) │  navy solid, disabled: opacity-40
└─────────────────────────────────────┘
```

- Option rows are **buttons** (full-width, left-aligned radio circle + text) — not grid tiles. Grid tiles = quiz-app slop; radio rows = clear Operate semantics.
- **Selection:** radio circle fills navy, border navy, row bg navy/[0.03]. `aria-pressed` or real radio semantics.
- **After submit:** row states flip — correct = emerald border + emerald light bg + check; wrong selected = red border + red light bg + ✗; correct answer highlighted even if not chosen (emerald outline + "Correct answer" mono tag). Disable all rows.
- **Explanation reveal:** below the options, panel slides in (350ms, Moment if scored high? No — explanation is Standard; the *score ring* is Moment). Panel: white card, navy left border OR light gray bg (accent-rail tell — avoid colored left strips; use a bordered card with mono "Why" kicker), includes the explanation + "Next question" button.
- **Progress within quiz:** thin bar at top of quiz card — "Q2/5" mono + 5-segment progress (segments fill red as answered). Segments = better than a bar for at-a-glance position.

### 5.3 Results + series stats

- **Results card (per attempt):** score ring (SVG stroke-dashoffset, Moment 400ms) with big tabular mono score "4/5", per-question review list (question, your answer, correct answer, ✓/✗), "Retry quiz" ghost + "Back to lesson" primary. Retry resets state and records a new attempt.
- **Series quiz stats (Learn hub + series page):** small Monitor strip per series with quiz data — "Quiz average 82% · 3 attempts" in mono; **only if quiz_attempts exist** (don't invent stats). Placement: on PathCard under progress rows (compact), and on the series header strip (onGradient).
- **First-attempt vs best:** BA says record attempts/results — display best score + attempts count. Arch confirms schema; UI just consumes `{ bestScore, attempts }`.

### 5.4 Quiz states to cover

- Loading JSON / submitting (button shows spinner or "Grading…" + disabled)
- Empty (no questions.json yet — render nothing or a subtle "Quiz coming soon" placeholder — execution task decides; recommend render nothing to avoid fake content)
- Guest vs signed-in (attempt saved locally vs synced)
- Error (JSON malformed → hide quiz, log to console)
- Reduced motion (5.5 in brief)

---

## 6. Design Token Draft — What's NEW (full CSS in design-tokens-draft.css)

The existing globals.css + design/design-tokens.css are the base. New tokens are **additive only**:

- **Motion tokens:** `--dur-micro: 120ms`, `--dur-std: 220ms`, `--dur-moment: 450ms`; `--ease-out: cubic-bezier(0.25, 1, 0.5, 1)`; `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`
- **Semantic state colors:** `--color-read: #10B981` (emerald — existing token reused), `--color-read-bg: #ECFDF5` (emerald-light), `--color-wrong: #C8102E` (red reused), `--color-wrong-bg: #FDE8EB` (new light red), `--color-current: #C8102E` (red reused)
- **Progress:** `--progress-track: var(--color-gray-200)`, `--progress-fill-content: var(--color-red)`, `--progress-fill-user: var(--color-read)` — two distinct fills so content vs user progress can never be confused
- **Quiz:** `--quiz-option-h: 44px` (touch target), `--quiz-radius: var(--radius-xl)`, score ring colors reuse red/emerald
- **Filter segmented:** reuse pill tokens; add `--segmented-radius: var(--radius-full)`

Complete token draft (with usage examples per component) in `design/discovery/design-tokens-draft.css`.

---

## 7. Component Inventory for the Execution Task

The EXECUTION task (t_bd445853) must produce mockups for:

1. **Blog listing** — read/unread PostCard states + All/Unread/Read segmented filter + empty state
2. **Post detail** — "Mark as read" button (top + bottom), read state, guest/synced note
3. **Learn hub** — PathCard with dual progress rows (content + user) + quiz stats strip
4. **Series page** — LessonCard with mark-complete control, current-lesson indicator, header strip with user progress + quiz stats
5. **Lesson detail** — quiz component full flow: unanswered → selected → submitted (correct/wrong) → explanation → results card; series stats on completion
6. **Motion study** — a dedicated motion-lab mockup showing Micro/Standard/Moment on the signature components (check pop, pulse dot, score ring) so steel can verify timing
7. **design-system.html** update — new tokens, states matrix, motion table, screenshots

States matrix to cover everywhere: default, hover, active, disabled, loading, empty, error, guest, signed-in, correct, wrong, complete, current.

---

## 8. Handoff Notes for Steel (implementation)

- **Keep the existing prefers-reduced-motion block** — all new motion is CSS transitions so it's auto-covered; any JS animation must check the media query manually
- Supabase client components: `post_reads`, `lesson_completions`, `quiz_attempts`, `quiz_answers` (arch t_718bb3ca owns schema); guest fallback = localStorage keyed by slug, merged on sign-in
- URL params: add `read` to blog listing; filter + sort + category compose cleanly
- LessonCard mark-complete button must `stopPropagation` + be a real `<button>` (a11y), 48px touch target on mobile
- Quiz option rows = real `<button>` elements with radio semantics; keyboard nav out of the box
- No new npm deps recommended for motion (CSS transitions/animations suffice); quiz needs no chart lib — score ring is plain SVG stroke-dashoffset

---

## 9. Mood Boards

Generated via FAL (pollinations needs an API key — noted in metadata, not a blocker). These are **atmosphere references, not production assets** — AI image-gen text is gibberish by design; the EXECUTION mockups use real copy.

- `design/discovery/moodboards/moodboard-motion.png` — card lift / arrow / pulse-dot vocabulary on off-white, navy/red
- `design/discovery/moodboards/moodboard-progress.png` — read/unread cards, mark-as-read pills, progress bars, emerald check vocabulary
- `design/discovery/moodboards/moodboard-quiz.png` — option rows, submit, feedback, score ring, explanation panel vocabulary

---

## 10. Slop Self-Audit (this direction, scored before delivery)

- Tech gradient: 0 (existing palette kept)
- Generic tech hue: 0 (navy/red brand, emerald reserved for done)
- Feature-tile grid: 0 (quiz = focused Operate, not card grid)
- Accent rail: 0 (explanation panel = bordered card, NOT colored left strip)
- Unearned blur: 0 (backdrop-blur only on existing banner chips)
- Monument stat: 0 (score ring is a *result*, not a decorative number; progress bars are thin Monitor signals)
- Icon topper: 0 (no rounded-square icons above headings)
- Center stack: 0 (asymmetric editorial layouts continue)
- Default type: 0 (Inter + mono chosen, kept)
- Wrong surface: 0 (surfaces committed in §1 before any token)
- **Score: 0/10**

Wow-factor levers for execution: Moment springs on accomplishment (check pop, score ring), segmented filter with mono counts, dual-layer progress bars, motion-lab mockup.

---

## 11. Discovery Outputs (this task)

| File | Purpose |
|---|---|
| `design/discovery/direction-brief.md` | THIS brief — surfaces, motion rules, component directions, states, handoff notes |
| `design/discovery/design-tokens-draft.css` | Additive token draft for steel + execution task |
| `design/discovery/moodboards/*.png` (3) | Atmosphere references |
