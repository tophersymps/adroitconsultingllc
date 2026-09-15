# Article Audio — how to add audio to a new article

Feature: a single-narrator (voice `af_heart`) audio player on every field-notes
article. Audio is a **free, auth-gated** sign-up perk: logged-out visitors see
a locked "Sign up to listen" card; signed-in readers get a native `<audio>`
player that streams the MP3 through the authenticated `GET /api/audio/[slug]`
route. MP3 blobs live in a **private** Cloudflare R2 bucket (`adroit-audio`,
reached over its S3 API), never in git and never behind a public URL.

Architecture + locked decisions: `docs/arch-audio-player.md` and
`src/lib/audio/contracts.ts`. Implementation plan:
`/Users/kelex/.hermes/plans/2026-09-14_232914-audio-article-player.md`.

## How to add audio to a new article

Run the batch generator for that one slug:

```bash
# Requires .env.local with the R2_* vars (+ the Supabase vars while the
# dual-write transition flag is on — see the write-path section below)
node scripts/build-audio.js --slug <slug> --voice af_heart
```

This:
1. reads `content/blog/<slug>.mdx`,
2. computes the narration with the shared pure function
   `mdxToNarration` (`src/lib/audio-narration.ts`),
3. synthesizes the MP3 with the Kokoro TTS engine
   (`scripts/tts/engines/engine_kokoro.py`, venv at `scripts/tts/.venv`),
   always as **mono / 24000 Hz / 48 kbps** (the lean storage profile, below),
4. uploads it to the PRIVATE Cloudflare R2 bucket `adroit-audio` at
   `blog/<slug>/af_heart.mp3` through `src/lib/r2/client.ts` (`putR2Object` —
   the same helper the migration tool uses; it re-reads R2 and fails the run if
   the stored size does not match), and — while the dual-write flag below is on
   — also to the private Supabase `audio` bucket,
5. uploads the timing manifest `blog/<slug>/af_heart.timing.json` to the same
   two stores, in the same order, with `application/json`,
6. rewrites `src/data/audio.ts` to include the entry.

> **Write path == read path.** `blog/<slug>/af_heart.mp3` and
> `blog/<slug>/af_heart.timing.json` are written straight to the bucket the
> routes read from, so a freshly generated article is playable immediately.
> The `scripts/migrate-audio-to-r2.cjs` mirror is no longer part of the
> generation flow — keep it for reconciliation/audits (it is idempotent).

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

## Storage: Cloudflare R2 (migration) + the lean encoding profile

Article audio is stored in the **private Cloudflare R2 bucket `adroit-audio`**
and read over its S3 API with bucket-scoped keys (`src/lib/r2/client.ts`).
Supabase Storage's Free tier bills storage AND egress (1 GB / 5 GB, roughly
385 listens); R2 gives 10 GB with zero egress fees. The Supabase `audio` bucket
still holds every object so a rollback is a config revert (re-point the reader)
rather than a restore.

### Write path and the rollback story

`scripts/build-audio.js` writes with the **same** `src/lib/r2/client.ts`
helpers the routes read with (`putR2Object` / `headR2Object`), so there is one
implementation of the endpoint, the credentials and the "verify the PUT by
re-reading R2" rule:

- **R2 is primary and always written.** A failed or short R2 write aborts the
  run — no entry is emitted for audio that is not in the bucket.
- **Supabase Storage is a dual write while the transition window is open.**
  `AUDIO_DUAL_WRITE_SUPABASE` in `.env.local` controls it: unset (the default
  today) = write both stores; `false` / `0` / `no` / `off` = R2 only. Rolling
  the reader back to Supabase is therefore a config change, not a code change.
- **Nothing is ever deleted from either bucket.** If dual write is switched
  off, the two stores diverge (Supabase keeps the older bytes for any
  regenerated article) — that is the intended state; R2 is authoritative.
- Gotcha when reading Supabase Storage over HTTP (i.e. after a reader
  rollback): object GETs go through a CDN (`cf-cache-status: HIT`), so a
  just-overwritten object can serve the previous bytes until the cache expires.
  The R2 read path is unaffected (server-side `GetObject` in the route).

- Reconcile / audit the two stores (idempotent — also the way to re-mirror
  anything written while dual write was off):

  ```bash
  node --env-file=.env.local scripts/migrate-audio-to-r2.cjs --dry-run      # report only
  node --env-file=.env.local scripts/migrate-audio-to-r2.cjs                # copy what is missing, then verify
  node --env-file=.env.local scripts/migrate-audio-to-r2.cjs --verify-only  # list both stores and compare
  ```

  It copies every object it does not already find in R2 at the same byte size
  through the shared `putR2Object` helper, re-reads R2 (ListObjectsV2, which
  the provisioned keys ARE allowed; a HeadObject sweep is the fallback if
  ListBucket is ever denied), and exits non-zero unless the two listings match
  on key set and per-object size. Keys are the same as the Supabase layout, so
  `src/data/audio.ts` is unchanged.
- R2 env vars live in `.env.local` only (never a `NEXT_PUBLIC_*` var, never a
  tracked file): `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`. The keys are **bucket-scoped** (Object Read & Write
  on `adroit-audio`); `ListBuckets` returning AccessDenied is expected.
- Storage budget: the private bucket must hold the whole article backfill, so
  every generated MP3 is **mono / 24000 Hz / 48 kbps** (~5 MB per 15-minute
  article). The retired 128 kbps profile measured ~13.3 MB per article.

- Override the bitrate per run with `--bitrate 64k`, or globally with the
  `AUDIO_BITRATE` env var. `build-audio.js` passes it straight to the engine
  (`--bitrate`) as a single **argv element** on the shell-free `execFileSync`
  call — no shell string is ever built — and both `build-audio.js` and
  `reencode-audio-lean.cjs` allowlist the value (`/^\d{2,3}k$/`, e.g. `48k`)
  before it reaches the engine/ffmpeg. The engine's default is also `48k`.
  **Do not raise the default for a backfill** without re-checking the bucket
  budget.
- To shrink audio that is ALREADY in the bucket (no TTS re-run):

  ```bash
  node scripts/reencode-audio-lean.cjs --dry-run   # report only
  node scripts/reencode-audio-lean.cjs             # re-encode mono/24k/48k in place
  ```

  It re-encodes only the MP3s referenced by `src/data/audio.ts`, skips files
  that are already mono/24k at <= 64 kbps, aborts if a transcode changes the
  duration (truncation guard), and verifies the stored size after upload.
  The timing manifests are NOT touched: a re-encode preserves duration, so the
  existing `blog/<slug>/af_heart.timing.json` offsets stay valid.

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
  public or signed URL: the private object is fetched server-side over the R2
  S3 API (bucket-scoped credentials) and returned as fixed `audio/mpeg` bytes.
- The TTS venv (`scripts/tts/.venv`) and all `*.mp3` / `*.wav` files are
  git-ignored (project norm: audio blobs live in R2, never in the repo).
- The engine prefers the `ffmpeg` CLI (Homebrew) so mono / sample rate /
  bitrate are pinned explicitly, and falls back to `pydub`; ensure `ffmpeg` is
  installed to get MP3 output. Without any converter it keeps a `.wav`.