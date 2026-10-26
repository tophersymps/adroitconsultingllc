# Interface contracts — Learn lesson IA + exam naming

**Task:** t_47db5c5e · companion to `architecture.md`
These are the seams between parallel cards. A card may only change a signature here by updating this
file in the same PR — that is what keeps A1/A3/A5/A6/A8 and B1/B2/B3/B4 buildable independently.

---

## A.1 `src/lib/lesson-sources.ts` (new, server-only — no `fs`, pure string work)

```ts
/** True when the document declares at least one GFM footnote definition. */
export function hasFootnoteDefinitions(mdx: string): boolean;
```

Rules: a definition is a line matching `/^\[\^[^\]]+\]:/m`. Used to skip the second render on lessons
with no sources (all 511 lessons currently return `true`).

---

## A.2 `src/components/MDX/footnote-plugins.ts` (new, server-only)

```ts
/** Rename the auto-generated footnote heading "Footnotes" → "Sources". (moved from MDXArticle) */
export function renameFootnoteHeading(): (tree: HastRoot) => HastRoot;

/** Remove the GFM footnotes section from the tree (used by the body render). */
export function dropFootnoteSection(): (tree: HastRoot) => HastRoot;

/** Remove everything EXCEPT the GFM footnotes section (used by the sources render). */
export function keepOnlyFootnoteSection(): (tree: HastRoot) => HastRoot;

/** Shared predicate: is this node the GFM footnotes section? */
export function isFootnoteSection(node: HastNode): boolean;
```
`isFootnoteSection` = `node.type === "element" && node.tagName === "section"` and
(`node.properties.dataFootnotes !== undefined` || className includes `"footnotes"`).
Both filters operate on top-level children only (the section is always a root child — verified).

---

## A.3 `src/components/MDX/MDXArticle.tsx` (edit — additive)

```ts
export type MDXArticleProps = {
  mdx: string;
  /** "inline" (default) = today's behaviour: sources inside the body render. */
  sources?: "inline" | "split";
};
```
- `inline`: pipeline unchanged (`renameFootnoteHeading` only).
- `split`: pipeline adds `dropFootnoteSection()` **after** the rename.
- No other caller changes. Blog/previews/`PreviewFirstLesson` do not pass the prop.

---

## A.4 `src/components/MDX/MDXSources.tsx` (new)

```ts
export default async function MDXSources({ mdx }: { mdx: string }): Promise<JSX.Element | null>;
```
- Pipeline: `remark-gfm` + `[renameFootnoteHeading, keepOnlyFootnoteSection]`.
- Returns `null` when the filtered tree has no footnotes section (never an empty heading).
- Renders inside caller-provided `.article-body` so it inherits type/link/dark-mode styles.
- Guarantee: for a document with N footnote definitions and M references, the output contains exactly
  N `li` elements with `id="user-content-fn-<k>"` and one backref `<a>` per reference
  (`#user-content-fnref-<k>`, `-#2`, …), matching the ids emitted by the `sources="split"` body render.

---

## B.1 `src/lib/lesson-checks.ts` (new, pure — no `fs`, no React; importable client and server)

```ts
import type { LearnLesson } from "@/data/types";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

/** No "locked": there is no lesson gating (architecture.md §4). */
export type CheckState = "passed" | "available";

export type TimelineNode =
  | { kind: "lesson"; lesson: LearnLesson }
  | { kind: "check"; check: KnowledgeCheckMeta };

/** Check whose range ENDS at this lesson (check 1 → lesson 5). */
export function checkEndingAt(
  checks: readonly KnowledgeCheckMeta[],
  lessonNumber: number,
): KnowledgeCheckMeta | undefined;

/** Check whose range COVERS this lesson (a <= n <= b). */
export function checkCovering(
  checks: readonly KnowledgeCheckMeta[],
  lessonNumber: number,
): KnowledgeCheckMeta | undefined;

/** First lesson strictly after a lesson number (dominates the check's range end). */
export function nextLessonAfter(
  lessons: readonly LearnLesson[],
  lessonNumber: number,
): LearnLesson | undefined;

/**
 * Interleave checks into lesson order. A check renders immediately AFTER the last
 * PUBLISHED lesson of its range; checks past the published tail render at the end,
 * in n order. Total: lessons.length + checks.length nodes.
 * Progress-independent: no completed-lesson / passed-check input exists, so every
 * check node is emitted on the first render (discoverability, architecture.md §3.2).
 */
export function buildTimeline(
  lessons: readonly LearnLesson[],
  checks: readonly KnowledgeCheckMeta[],
): TimelineNode[];

export function checkState(
  check: KnowledgeCheckMeta,
  passedCheckNumbers: ReadonlySet<number>,
): CheckState;   // "passed" when the set contains check.n, else "available"; never "locked"

/** D-5 rule: hide a check node only when passed AND every lesson in its range is hidden. */
export function hiddenByFilter(
  node: TimelineNode,
  hiddenLessonNumbers: ReadonlySet<number>,
  passedCheckNumbers: ReadonlySet<number>,
): boolean;
```

**Amendment (A3, same PR):** the hidden set is **lesson numbers**, not slugs. A check node's
range is `[a, b]` in lesson numbers, so a slug set cannot answer "is *every* lesson in this range
hidden" without also receiving the lessons; a number set answers it directly and keeps the
predicate total. The syllabus (A5) maps its completed-lesson slugs to `lesson` numbers once, when
it builds the set. First parameter stays the node and the third stays the passed-check set, so the
call shape A5 was written against is unchanged.

---

## B.2 No gate module (withdrawn — D-1 decided: no lesson gating)

This section previously specified `src/lib/learn-gate.ts` (`LESSON_GATE_MODE`, `resolveLessonGate`,
`LessonGateMode`). **It is withdrawn.** Chris decided on 2026-10-25 that there is no lesson gating
(architecture.md §4). Nothing in this release creates that file, that type, that constant or any
`blocked`/`mode` prop, and no `locked` value exists in `CheckState`.

What replaces it is routing only, delivered by B.1 + B.3 + B.5:

- a check node is placed after the last lesson of its range (`buildTimeline`);
- on that lesson, Next and `MilestonePanel` point **into** the check when it is not passed;
- on a pass, the check's results offer "Continue to Lesson N";
- the following lesson always renders, whether or not the check is passed.

---

## B.3 `src/lib/check-scores.ts` (new, server — extracted from `exam/page.tsx:152-184`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeCheckMeta } from "@/shared/contracts";

/** Per-check authoritative pass state from server-graded quiz_attempt rows. */
export function loadCheckScores(
  supabase: SupabaseClient,
  userId: string,
  series: string,
  checks: readonly KnowledgeCheckMeta[],
): Promise<Map<number, { bestScore: number; passed: boolean }>>;

/** Single-check convenience used by the lesson page (one query, one check). */
export function loadCheckScore(
  supabase: SupabaseClient,
  userId: string,
  series: string,
  checkNumber: number,
): Promise<{ bestScore: number; passed: boolean }>;
```
Behaviour is **identical** to today's exam-page derivation: rows from `quiz_attempt` filtered by
`user_id` + `${series}:check:<n>`, scored with `scoreQuizAttemptsByQuiz` against canonical totals from
`getKnowledgeCheck(...).questions.length`, pass at `CERT_CHECK_PASS_PCT` (80). Partial attempt sets
never score. Refactor must not change the exam page's behaviour (its test stays green untouched).

---

## B.4 `src/lib/hooks/useTierProgress.ts` (new, client)

```ts
export function useTierProgress(series: string): {
  tiers: TierProgress | null;
  isLoading: boolean;
  refresh: () => void;
};
```
- Module-level `Map<string, { promise?: Promise<TierProgress>;
  data?: TierProgress }>` keyed by series: N consumers on one page render share **one**
  `GET /api/progress/quiz/tiers?series=…` (`cache: "no-store"`).
- Guest / error → `tiers: null` (every consumer renders its unavailable state, as today).
- Consumers: `SeriesSyllabus` (check node state), `ExamCard`, `CertReadiness`. That is every
  `/api/progress/quiz/tiers` caller on `/atlas/[series]` today, so the series page drops from
  **three** requests to **one**. `CheckCardList` is deleted.
- `CertReadiness` keeps its contract: `tiers === null` → render nothing (guest, error, or still
  loading) — it must not gain a skeleton or shift the hero layout.
- Must not fire for series with zero checks (guard at the call site).

---

## B.5 Component prop contracts

### `CheckTimelineNode` (new, client)

```ts
type CheckTimelineNodeProps = {
  series: string;
  check: KnowledgeCheckMeta;          // { n, lessons: [a, b] }
  state: CheckState;                  // "passed" | "available"  (no "locked")
  bestScore?: number;                 // present only when passed
  /** Copy line from the label source ("Pass each check with 80%+ to unlock the …"). */
  unlockNote?: string;
};
```
- Renders `<Link href={/atlas/<series>/check/<n>}>` with an accessible name covering number, range and
  state: `"Knowledge Check 1, lessons 1 to 5, passed 87 percent"` / `"…, available"`. There is no
  locked variant of this name — the check is always a link (architecture.md §4).
- Badge is text + icon (never colour-only). Row height ≥ 44 px at every width. No fixed `min-w`.
- **Rendered for every check on first view**, independent of progress: the prop is the check's state,
  and a learner with zero completed lessons gets `state: "available"` — the node exists before its range
  is reached (discoverability requirement, architecture.md §3.2).
- Visually distinct from `LessonCard`: milestone treatment (K{n} marker + emphasis), not a lesson row.

### `MilestonePanel` (new, server-rendered presentational)

```ts
type MilestonePanelProps = {
  series: string;
  check: KnowledgeCheckMeta;
  nextLesson: LearnLesson | undefined;
  passed: boolean;                    // check passed → offer "Continue to Lesson N"
};
```
- `passed: false` → "You've finished lessons a–b" + primary
  `→ /atlas/<series>/check/<n>` ("Take Knowledge Check <n>").
- `passed: true` → primary `→ /atlas/<series>/<next.slug>` ("Continue to Lesson <next.lesson>").
- No `mode`/`blocked` prop: the panel is always additive, never a substitute for the lesson body, and
  it never renders on a lesson that does not end a range.
- No client state, no fetch: it must render on first paint.

### `LessonNavigation` (edit — additive)

```ts
type LessonNavigationProps = {
  lessons: LearnLesson[];
  currentSlug: string;
  /** Replaces the "next lesson" card (used to route into a covering check). */
  nextOverride?: { href: string; label: string; sublabel?: string };
};
```
- `nextOverride` renders in the "next" slot with the same visual treatment, `label` as the heading
  ("Knowledge Check 1") and `sublabel` as the mono kicker ("Lessons 1–5").
- `prev` behaviour unchanged. Absent → byte-identical output to today.

### `QuizWidget` (edit — additive)

```ts
type QuizWidgetProps = {
  /* …existing… */
  /** Shown as the PRIMARY results action when the run passed. */
  continueHref?: string;
  continueLabel?: string;   // default "Continue"
};
```
- Continue renders only when `passThreshold` is set **and** the run passed **and** `continueHref` is
  present. Retake stays primary on fail. Lesson-tier callers pass neither → unchanged.

### `AudioPlayer` / `AudioPlayerLazy` (edit — additive)

```ts
type AudioPlayerProps = {
  /* …existing… */
  /** Optional trailing control in the header row (completion toggle lives here). */
  trailing?: React.ReactNode;
};
```
- Rendered only in the authed player branch, before the Speed control, inside the existing header row.
- The guest branch (locked "sign up to listen" card) never renders `trailing`.
- `AudioPlayer` must not import anything from `@/lib/hooks/useLessonProgress` or
  `@/components/Progress/*` — the slot keeps the player chunk free of the progress stack.

### `MarkCompleteCompact` (new, client)

```ts
type MarkCompleteCompactProps = {
  lessonSlug: string;
  label?: string;   // accessible name suffix, default "lesson"
};
```
- State owner: `useLessonProgress(lessonSlug)` — identical hook and write path as `MarkComplete`.
- Incomplete: `<button aria-label="Mark lesson complete">` "Mark complete", ≥ 44×44 px, no animation.
- Complete: static chip in a `role="status" aria-live="polite"` region — text "Completed", check glyph,
  no click handler, no duplicate action. Un-marking remains the hero control's job.
- Keyboard: reachable in DOM order immediately after the player controls.

---

## C. Workstream B contracts

### `src/data/types.ts` (edit)

```ts
export type ExamKind = "certification-prep" | "course-completion";

export interface LearningSeries {
  /* …existing… */
  /** REQUIRED. Validated at build time; drives every exam label. Never inferred. */
  examKind: ExamKind;
}
```
Not added to `LearnCardSeries` — no hub/exam surface reads it, and keeping it out keeps the card
projection slim (guest-hardening rule).

### `src/lib/exam-labels.ts` (new, client-safe — imports only `type ExamKind`)

```ts
export interface ExamLabelling {
  full: string;                       // "Course Completion Exam" | "Certification Prep Exam"
  short: string;                      // "Course Exam"          | "Cert Prep Exam"
  phrase: string;                     // "course completion exam" | "cert prep exam"
  lockHeading(checkCount: number): string;
  seoTitle(seriesName: string): string;
  seoDescription(seriesName: string): string;
  unlockNote(checkPassPct: number): string;   // syllabus/CheckNode explanatory line
}

export const EXAM_LABELS: Record<ExamKind, ExamLabelling>;
/** Total. Throws at build/test time on an unknown kind; never defaults to cert prep. */
export function examLabels(kind: ExamKind): ExamLabelling;
```

Copy (final, Kara may only change typography not wording without Lois):

| field | `certification-prep` | `course-completion` |
|---|---|---|
| `full` | Certification Prep Exam | Course Completion Exam |
| `short` | Cert Prep Exam | Course Exam |
| `phrase` | cert prep exam | course completion exam |
| `lockHeading(n)` | `Unlock: complete all ${n} knowledge checks with 80%+` | same sentence (count from prop) |
| `seoTitle(name)` | `${name}: Certification Prep Exam \| Adroit Learn` | `${name}: Course Completion Exam \| Adroit Learn` |
| `seoDescription(name)` | `Timed certification prep exam for ${name}.` | `Timed course completion exam for ${name}.` |

### Kind plumbing props (all server-resolved)

```ts
ExamCard      { series: string; totalChecks: number; kind: ExamKind; questionCount: number; passPct: number; minutes: number }
ExamLocked    { series: string; checks: CheckProgress[]; seriesName: string; kind: ExamKind; minutes: number }
ExamWidget    { …existing…; kind: ExamKind }
Certificate   { …existing…; kind: ExamKind }
GuestCTA      { tier: GuestCtaTier; ariaLabel?: string; kind?: ExamKind; checkCount?: number; questionCount?: number; minutes?: number }
CheckTimelineNode.unlockNote ─ from examLabels(kind).unlockNote(CERT_CHECK_PASS_PCT)
```
`kind` is required on the exam/certificate surfaces (compile-time guarantee that a new surface cannot
forget it). `GuestCTA` keeps `kind` optional so the `lesson`/`check` tiers and any non-series caller are
unchanged; when `tier` is `exam` or `certificate` the caller must pass it (asserted by a test).

### `src/lib/sky.ts` (edit)

```ts
export function chronicleLabel(
  event: CompletionEventRow,
  ctx: { courseName?: string | null; lessonLabel?: string | null; examKind?: ExamKind },
): string;
```
- `case "exam"` → `${courseName} · ${examLabels(ctx.examKind ?? "course-completion").phrase} passed`?
  **No** — do not guess. Contract: when `examKind` is absent the label degrades to
  `${courseName} · exam passed`. Callers (`sky-server`, `buildChronicle`) resolve the kind from the
  series slug and pass it. A test covers both branches.

### `src/lib/exam-config.ts` (new)

```ts
/** Exam duration (minutes). Single home for the value currently hardcoded on five surfaces
 *  (ExamWidget.tsx:29 + :432, ExamLocked.tsx:39, GuestCTA.tsx:40, ExamCard.tsx:75,
 *   app/atlas/[series]/exam/page.tsx:142). */
export const CERT_EXAM_MINUTES = 105;
```

### `content/learn/<series>/exam.json` title contract

| kind | title shape | example |
|---|---|---|
| `course-completion` | `<series name>: Course Completion Exam` | `AI at Work: Course Completion Exam` |
| `certification-prep` | keep the certification-naming title (must mention the certification) | `OmniStudio Developer Certification - Practice Exam` |

Test: for every series, `exam.json.title` must not contain the *other* kind's label terms
(`Course Completion` for cert series; `Certification`/`Cert Prep` for track series).
