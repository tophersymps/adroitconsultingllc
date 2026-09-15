# Article Audio — how to add audio to a new article

Feature: a single-narrator (voice `af_heart`) audio player on every field-notes
article. Audio is a **free, auth-gated** sign-up perk: logged-out visitors see
a locked "Sign up to listen" card; signed-in readers get a native `<audio>`
player that streams the MP3 through the authenticated `GET /api/audio/[slug]`
route. MP3 blobs live in a **private** Supabase Storage bucket, never in git.

Architecture + locked decisions: `docs/arch-audio-player.md` and
`src/lib/audio/contracts.ts`. Implementation plan:
`/Users/kelex/.hermes/plans/2026-09-14_232914-audio-article-player.md`.

## How to add audio to a new article

Run the batch generator for that one slug:

```bash
# Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
node scripts/build-audio.js --slug <slug> --voice af_heart
```

This:
1. reads `content/blog/<slug>.mdx`,
2. computes the narration with the shared pure function
   `mdxToNarration` (`src/lib/audio-narration.ts`),
3. synthesizes the MP3 with the Kokoro TTS engine
   (`scripts/tts/engines/engine_kokoro.py`, venv at `scripts/tts/.venv`),
4. uploads it to the PRIVATE `audio` bucket at
   `audio/blog/<slug>/af_heart.mp3` (service-role key, REST upload),
5. rewrites `src/data/audio.ts` to include the entry.

To pilot the N newest articles:

```bash
node scripts/build-audio.js --recent 5 --voice af_heart
```

To emit `src/data/audio.ts` **without** synthesizing/uploading (e.g. to fix the
metadata or rebuild a clean module):

```bash
node scripts/build-audio.js --metadata-only --recent 5 --voice af_heart
```

Any failure aborts the run (fails loudly, no silent SKIP, no fabricated mp3).

## Diagram-description behaviour (the narration contract)

Every `![alt](<path>)` image in an article already has its `alt` text rendered
by the `Figure` component as BOTH the visible caption and the `img` aria label.
The narration reads that exact alt text as a spoken diagram line:

```
Diagram: <alt text>.
```

So a listener without visual access hears what each diagram depicts. If an
alt is too terse, add a `description::` line immediately after the image and
the narration will read that instead:

```md
![Architecture](</diagrams/x.png>)
description:: A detailed spoken walkthrough of the pipeline.
```

(The `description::` override is the documented extension point in
`src/lib/audio-narration.ts`.)

## Voice list

Single locked narrator for the pilot: **`af_heart`** (Kokoro US-F flagship).
No visitor selector. Other shortlist voices exist for future choice:
`af_bella`, `af_nicole`, `bf_emma`, `am_michael` (samples in
`scripts/tts/samples/`).

## Requirements / gotchas

- The route `src/app/api/audio/[slug]/route.ts` is auth-gated: it resolves the
  visitor's session server-side (`getSupabaseServerClient().auth.getUser()`),
  returns `401` unauthenticated, `404` for a slug not in `src/data/audio.ts`
  (or a missing object), and `200 audio/mpeg` with
  `Cache-Control: private, max-age=3600` otherwise. It **never** constructs a
  public storage URL — the private object is downloaded with the service-role
  client and returned as fixed `audio/mpeg` bytes.
- The TTS venv (`scripts/tts/.venv`) and all `*.mp3` / `*.wav` files are
  git-ignored (project norm: blobs stay in Supabase, not the repo).
- The engine falls back to `ffmpeg` (Homebrew) when `pydub` is unavailable;
  ensure `ffmpeg` is installed to get MP3 output.