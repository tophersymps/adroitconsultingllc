# Lesson Audio Extension — System Architecture

Feature: extend the proven article-audio feature to the Atlas (Learn) tab, so each narrated lesson gets the same single-narrator (voice `af_heart`) auth-gated audio player. This is scaffolding on the `feat/lesson-audio` branch — NOT a deploy to main. The backfill cron runs later, after the diagram retrofit completes. Arch contract types: `src/lib/audio/contracts.ts`. Template: `docs/arch-audio-player.md`.

## Stack

- Next.js 16.3.4 App Router (repo `adroit-site-copy`). The lesson page `src/app/atlas/[series]/[slug]/page.tsx` is already `force-dynamic` (session + access seam), so mounting the player adds no new dynamic boundary.
- Cloudflare R2 (PRIVATE bucket `adroit-audio`, S3 API via `src/lib/r2/client.ts`) — the READ store, unchanged. The Supabase Storage `audio` bucket stays the generation-side source bucket. Lesson MP3s use the same lean profile (mono / 24000 Hz / 48kbps) and the same dual-write + verify-by-re-read rule.
- Kokoro-82M TTS, single voice `af_heart`, invoked directly by `scripts/build-audio.js` (no dispatcher). Runs on the Fortress Mac.
- Vitest 4 + Testing Library (mirror existing `src/**/*.test.ts(x)`).

## Component map

- `AudioPlayer` / `AudioPlayerLazy` (existing, `src/components/BlogPost/`) — REUSED unchanged for lessons. Props are `{ slug, hasAudio? }`; only the boolean crosses the boundary, so the private `storagePath` / `timingsStoragePath` are never serialized to the client. Auth via `useAuth()`.
- Lesson page `src/app/atlas/[series]/[slug]/page.tsx` (existing, `force-dynamic`) — wires the player, gated server-side on the lesson's audio entry (same pattern as the article page `field-notes/[slug]/page.tsx:176-180`). No player when no audio entry.
- `MDXArticle` / `Figure` (existing) — markdown `alt` is the spoken diagram description; no change required.
- `GET /api/audio/[slug]` (existing route) — extended to resolve `learn/` keys in addition to `blog/` keys. No parallel route needed.

## Data & API

### Storage key scheme

Lesson audio uses a `learn/` prefix, NOT `blog/`:

```
learn/<series>/<slug>/<voice>.mp3
learn/<series>/<slug>/<voice>.timing.json
```

Example: `learn/salesforce-sharing-visibility-architect/day-01-p-1a-object-permissions-crud-system-vs-object-profiles/af_heart.mp3`.

The lesson slug is unique across the whole catalogue (it is the MDX filename under `content/learn/<series>/`), but the series prefix is REQUIRED because the same slug can appear in multiple series (e.g. `framing-value-and-roi` exists in `hermes-consultant` and `hermes-consultant-intermediate`). The `learn/<series>/<slug>/` prefix disambiguates them. The same key resolves in both stores (Supabase source bucket + R2), exactly like the `blog/` scheme.

### Contract decision: parallel `LessonAudio` module, not an extension of `ArticleAudio`

Decision: add a PARALLEL `LessonAudio` interface + a separate generated `src/data/lesson-audio.ts`, rather than extending `ArticleAudio` / `src/data/audio.ts`.

Rationale:
- `ArticleAudio.slug` is documented as "must match a slug in src/data/posts.ts and content/blog/<slug>.mdx". A lesson slug does not satisfy that contract, and `AudioStorageKey` is typed as `blog/<string>/<string>.mp3` — a `learn/` key is a type violation. Extending the existing contract would weaken its invariants for the article feature.
- The lesson page resolves audio by `(series, slug)`, not by `slug` alone. A parallel module can carry `series` explicitly, which the flat `articleAudio.find(a => a.slug === slug)` lookup cannot express.
- The generated `src/data/audio.ts` is already large (100+ entries) and owned by the article backfill cron. Keeping lesson entries in a separate module avoids cross-contamination between the two backfill sweeps and keeps each generator's merge logic independent.

New contract types in `src/lib/audio/contracts.ts`:

```ts
export type LessonAudioStorageKey = `learn/${string}/${string}/${string}.mp3`;
export type LessonAudioTimingStorageKey = `learn/${string}/${string}/${string}.timing.json`;

export interface LessonAudio {
  /** Series slug — content/learn/<series>/ dir name. */
  series: string;
  /** Lesson slug — MDX filename under content/learn/<series>/. */
  slug: string;
  /** Kokoro voice id. Single narrator; DEFAULT_VOICE for the pilot. */
  voice: string;
  /** Object key: learn/<series>/<slug>/<voice>.mp3 (same key in Supabase source bucket and R2). */
  storagePath: LessonAudioStorageKey;
  /** Optional timing manifest key: learn/<series>/<slug>/<voice>.timing.json. */
  timingsStoragePath?: LessonAudioTimingStorageKey;
}
```

Generated module `src/data/lesson-audio.ts`:

```ts
export const lessonAudio: LessonAudio[] = [...];
```

The lesson page resolves `const audio = lessonAudio.find(a => a.series === series && a.slug === slug)`.

### Route resolution

`GET /api/audio/[slug]` is extended to resolve BOTH key spaces. The route currently does `articleAudio.find(a => a.slug === slug)`. It becomes:

1. Look up `articleAudio.find(a => a.slug === slug)` → if found, `storagePath` is the `blog/` key.
2. Else look up `lessonAudio.filter(a => a.slug === slug)` → if found, `storagePath` is the `learn/<series>/<slug>/` key.
3. Else 404.

A bare `slug` lookup in `lessonAudio` is unambiguous ONLY when the slug is unique across the catalogue. Because the same lesson slug CAN appear in multiple series (ADR-102, e.g. `framing-value-and-roi` in `hermes-consultant` and `hermes-consultant-intermediate`), a collision is AMBIGUOUS from a bare slug — the route cannot know which course the caller means. The route therefore fails closed to 404 when a slug maps to more than one series, rather than serving the first `.find()` match. Lesson entries are also MEMBERS-ONLY: the route enforces `accessSeam.decideCourseAccess(userId, series)` and returns 404 for non-entitled users (mirroring the lesson page's paywall/not-launched gate), so a signed-in free member cannot stream members-only narration by slug (CWE-862). The route's auth gate, Range/206 handling, and fail-closed 401 are unchanged. The `/timings` twin route gets the same two-space resolution + access gate.

### Generator: `scripts/build-audio.js` learn mode

The generator gains a `--learn` mode that targets `content/learn/<series>/<slug>` paths and emits `learn/`-prefixed entries into `src/data/lesson-audio.ts`:

- New flag `--learn` (or `--learn <series>` to scope to one series). When set, the slug source becomes `content/learn/<series>/*.mdx` instead of `content/blog/*.mdx`.
- The narration builder is reused unchanged (`mdxToNarration` already handles lesson MDX — verified below).
- Storage keys become `learn/<series>/<slug>/<voice>.mp3` and `learn/<series>/<slug>/<voice>.timing.json`.
- The merge/union logic is preserved but keyed on `series/slug/voice` and written to `src/data/lesson-audio.ts` (a new `emitLesson` function mirroring `emit`). The existing `--backfill` blog path is untouched.
- `assertSafeSlug` already covers lesson slugs (kebab-case). A new `assertSafeSeries` (same `SLUG_RE`) validates the series dir name before it reaches a path or storage key — same CWE-78/path-traversal discipline as the existing allowlists.

### Auth seam alignment

The lesson page's auth seam matches the audio route's auth. The lesson page already resolves `getSupabaseServerClient().auth.getUser()` (`page.tsx:87-89`) and gates content on the access seam (`accessSeam.decideCourseAccess`, ADR-201). The audio route uses the SAME `getSupabaseServerClient().auth.getUser()` mechanism (`route.ts:68-72`). Both are HttpOnly-cookie session checks. Lessons are members-only (paywall-gated), so the audio route additionally enforces `accessSeam.decideCourseAccess(userId, series)` for lesson entries (t_5d093ce2) — a signed-in user who can see the lesson content is exactly the user the audio route will authenticate, and a signed-in free member who cannot see the content is denied (404).

### Narration builder — verified, no change

`src/lib/audio-narration.ts` needs NO change for lessons. Verified by running `mdxToNarration` on a real lesson with 5 diagrams (`content/learn/salesforce-sharing-visibility-architect/day-01-p-1a-object-permissions-crud-system-vs-object-profiles.mdx`):

- 106 narration lines
- 5 `Diagram: <alt>.` lines (one per figure)
- 16 `Section: <heading>.` cues
- 0 leaked syntax/tag lines (no `#`, `*`, `_`, backtick, `[`, `]`, `<`, `>` in the output)

Lessons use the same `![alt](</diagrams/...>)` image form and GFM endnotes as articles, which the builder already handles. No gap found.

## Data flow

client `<audio src="/api/audio/<lesson-slug>">` → route handler → cookie session check (`getSupabaseServerClient`) → `articleAudio` lookup, else `lessonAudio` lookup → server-side R2 read (`getR2ObjectStream`, private `adroit-audio`) → `audio/mpeg` bytes → native player. Logged-out visitor hits the locked card; the fetch only happens once authenticated. No public URL and no signed URL exists at any hop.

```mermaid
  accTitle: Lesson audio read path
  accDescr: The lesson page renders the player only when the lesson has an audio entry and the reader is signed in; the browser requests GET /api/audio/<slug>; the route answers 401 without a valid session, 404 for an unknown slug, otherwise reads the object from the private R2 bucket and returns audio/mpeg bytes.
flowchart LR
  V[Visitor] --> P[Lesson page force-dynamic]
  P --> A1{lessonAudio has series+slug?}
  A1 -- no --> NULL[render null]
  A1 -- yes --> U{useAuth isAuthed?}
  U -- no --> LOCK[Locked: Sign up to listen]
  U -- yes --> AP[AudioPlayer audio tag]
  AP --> R[GET /api/audio/slug]
  R --> S{getUser valid?}
  S -- no --> 401
  S -- yes --> LOOKUP{articleAudio then lessonAudio?}
  LOOKUP -- no --> 404
  LOOKUP -- yes --> DL[R2 GetObject private learn/ key]
  DL --> 200[audio/mpeg]
```

## ADRs

| ID | Title | Decision | Alternatives | Consequences |
|----|-------|----------|--------------|--------------|
| ADR-101 | Parallel `LessonAudio` module over extending `ArticleAudio` | New `LessonAudio` interface + generated `src/data/lesson-audio.ts` | Extend `ArticleAudio` / `src/data/audio.ts` | Keeps `ArticleAudio.slug`/`AudioStorageKey` invariants intact; lesson page resolves by `(series, slug)`; independent backfill merge |
| ADR-102 | `learn/<series>/<slug>/` storage prefix | Lesson keys are `learn/<series>/<slug>/<voice>.mp3` | Reuse `blog/<slug>/` | Disambiguates same slug across series; mirrors the `blog/` dual-store scheme |
| ADR-103 | Extend `GET /api/audio/[slug]` with two-space resolution | Route checks `articleAudio` then `lessonAudio`; a lesson slug that maps to more than one series is ambiguous and 404s; lesson entries additionally pass `accessSeam.decideCourseAccess` (members-only) | Parallel `/api/audio/learn/[series]/[slug]` route | One route, one auth gate, one Range/206 path; bare-slug lookup is unambiguous only when the slug is unique, so a collision fails closed to 404 rather than serving the first match |
| ADR-104 | Reuse `AudioPlayer`/`AudioPlayerLazy` unchanged | Same client components, same `{ slug, hasAudio }` props | New lesson-specific player | No new client chunk; `hasAudio` boolean keeps private keys off the wire |
| ADR-105 | Reuse `mdxToNarration` unchanged | Lesson MDX feeds the same pure function | Fork a lesson narration builder | Verified on a 5-diagram lesson: 0 leaked syntax; one code path to maintain |

## Non-goals / explicit cut

- No backfill in this scaffolding task. The lesson-audio backfill cron runs later, after the diagram retrofit completes. `src/data/lesson-audio.ts` starts empty (or with whatever the scaffolding seeds).
- No visitor voice selector (single narrator, locked `af_heart`).
- No public audio URL, no signed audio URL, no open bucket.
- No audio in git (MP3 lives in R2, mirrored in the Supabase source bucket; `*.mp3` gitignored).
- No change to the article-audio feature or its `src/data/audio.ts`.

## Handoff to Kara (designer)

The lesson player reuses the existing `AudioPlayer` locked/signed-in states — no new visual design required. Kara should confirm the sticky player placement on the lesson page matches the article page's `sticky top-16 z-40` wrapper and that the locked card copy ("Listen free with an account") reads correctly in the lesson context. Figure/alt text unchanged.

## Implementation steps for Steel

1. Add `LessonAudio`, `LessonAudioStorageKey`, `LessonAudioTimingStorageKey` to `src/lib/audio/contracts.ts` (owned by brainiac — do not hand-edit; reopen the arch task if the contract is wrong).
2. Add `emitLesson` + `--learn` mode to `scripts/build-audio.js` (learn slug source, `learn/` keys, `src/data/lesson-audio.ts` output, `assertSafeSeries`).
3. Create `src/data/lesson-audio.ts` (generated, starts empty or seeded).
4. Extend `GET /api/audio/[slug]` (and its `/timings` twin) to resolve `articleAudio` then `lessonAudio`.
5. Wire the player into `src/app/atlas/[series]/[slug]/page.tsx`, gated on `lessonAudio.find(a => a.series === series && a.slug === slug)`.
6. Verify narration on a real lesson MDX (5-diagram file) — no syntax/tags spoken.
7. Run the test suite (`npx vitest run src/lib/audio-narration.test.ts` + audio/atlas tests). No em-dashes in new prose. Commit to `feat/lesson-audio` only; do NOT push to main.
