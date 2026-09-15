/**
 * src/lib/audio/contracts.ts — cross-sub-task contract types for the article
 * audio feature (arch task t_99c1a594).
 *
 * Owned by brainiac (arch task t_99c1a594). Build sub-task workers (steel)
 * IMPORT from here and MUST NOT hand-edit this file. If a contract is wrong,
 * reopen the arch task. Mirrors: docs/arch-audio-player.md.
 *
 * Locked decisions (plan 2026-09-14_232914-audio-article-player.md):
 *   - engine Kokoro-82M, ONE narrator (default voice "af_heart")
 *   - audio is a FREE, AUTH-GATED sign-up benefit
 *   - audio lives in a PRIVATE Supabase Storage bucket, streamed through the
 *     authenticated GET /api/audio/[slug] route
 *   - narration reads each Figure's markdown alt text as the spoken diagram
 *     description (alt IS the accessible figure description already)
 *   - pilot on the 5 most recent articles, backfill separately
 *
 * NO public storage URL is ever emitted. `articles.audioUrl` does not exist;
 * the player always fetches `/api/audio/<slug>` and the route serves the
 * private object server-side after an authenticated session check.
 */

/* ------------------------------------------------------------------ */
/*  Storage layout                                                     */
/* ------------------------------------------------------------------ */

/** Private Supabase Storage bucket that holds narrated article audio. */
export const AUDIO_BUCKET = "audio" as const;

/** Default (and only) narrator voice for the pilot. Single voice, no selector. */
export const DEFAULT_VOICE = "af_heart" as const;

/**
 * Object key of one article narration relative to the AUDIO_BUCKET root.
 * Scheme: blog/<slug>/<voice>.mp3  (example: blog/agent-eval-infrastructure-2026/af_heart.mp3)
 * One mp3 per published article, keyed by the post slug from src/data/posts.ts.
 */
export type AudioStorageKey = `blog/${string}/${string}.mp3`;

/**
 * Object key of one article's segment-timing manifest relative to the
 * AUDIO_BUCKET root. Scheme: blog/<slug>/<voice>.timing.json
 * (example: blog/agent-eval-infrastructure-2026/af_heart.timing.json).
 * Written by engine_kokoro.py + uploaded by build-audio.js so the client can
 * snap a scrolled article to the exact spoken paragraph (Tier C).
 */
export type AudioTimingStorageKey = `blog/${string}/${string}.timing.json`;

/**
 * A single narrated article. Generated as a static array by
 * scripts/build-audio.js and emitted to src/data/audio.ts:
 *
 *     export const articleAudio: ArticleAudio[] = [...];
 *
 * The page resolves the player via articleAudio.find((a) => a.slug === slug).
 * `storagePath` is the private-bucket key, used ONLY by the /api/audio route
 * when streaming server-side. Public URLs are never constructed from it.
 */
export interface ArticleAudio {
  /** Article slug; must match a slug in src/data/posts.ts and content/blog/<slug>.mdx. */
  slug: string;
  /** Kokoro voice id of the narration. Single narrator; DEFAULT_VOICE for the pilot. */
  voice: string;
  /** Object key in the PRIVATE 'audio' bucket: blog/<slug>/<voice>.mp3. */
  storagePath: AudioStorageKey;
  /**
   * Optional object key of the segment-timing manifest (Tier C exact
   * paragraph scroll-sync): blog/<slug>/<voice>.timing.json.
   * Absent for articles generated before timing capture landed; the client
   * degrades gracefully (no Follow-along) when it is missing. Like storagePath
   * it is a bucket key ONLY — never serialized to the client; the manifest is
   * served by the authed GET /api/audio/<slug>/timings route.
   */
  timingsStoragePath?: AudioTimingStorageKey;
}

/**
 * Exact per-segment timing for a narration. One entry per Kokoro output
 * segment, captured at generation time from the segment sample boundaries
 * (sample_rate-known, Kokoro SR 24000). `text` is the segment's leading
 * phrase/graphemes — used to align the segment back to an article block.
 * The manifest on disk is a plain array: SegmentTiming[].
 */
export interface SegmentTiming {
  /** The spoken segment's leading phrase/graphemes. */
  text: string;
  /** Cumulative start time of this segment in the concatenated MP3 (seconds). */
  startSec: number;
  /** Cumulative end time of this segment (seconds). Last endSec ≈ MP3 duration. */
  endSec: number;
}

/** Compile-time guard: every audio entry must resolve to a private-bucket key. */
export type ArticleAudioList = readonly ArticleAudio[];

/* ------------------------------------------------------------------ */
/*  GET /api/audio/[slug] route contract                               */
/* ------------------------------------------------------------------ */

/** Route handler param shape (Next 16 App Router uses a Promise params). */
export interface AudioRouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * Response matrix for GET /api/audio/<slug>. The route is DYNAMIC (it depends
 * on the visitor's session), does NOT emit a public URL, and streams the
 * private object back as audio/mpeg with a private cache control:
 *
 *   200  audio/mpeg, "Cache-Control: private, max-age=3600"
 *        signed-in + slug present in articleAudio + object retrievable.
 *   401  unauthenticated / invalid session (no cookie, rejected token).
 *   404  unknown slug (not in articleAudio) OR private object missing.
 *
 * Auth resolution: getSupabaseServerClient().auth.getUser() (HttpOnly cookie,
 * same mechanism as every other authed route; httpOnly enforced always,
 * secure in production — see lib/supabase/cookie-options.ts). Authorized-bucket
 * read uses getSupabaseServiceClient().storage.from(AUDIO_BUCKET).download(storagePath).
 * Preferred body path streams the ArrayBuffer; if a buffered response is
 * impractical on this Next release, fall back to a server-minted short-lived
 * signed download URL (accessible only because the authed server minted it).
 */
export type AudioRouteResponse =
  | { status: 200; contentType: "audio/mpeg"; cacheControl: "private, max-age=3600" }
  | { status: 401; contentType: null }
  | { status: 404; contentType: null };

/* ------------------------------------------------------------------ */
/*  Narration (spoken diagram descriptions)                            */
/* ------------------------------------------------------------------ */

/**
 * Spoken-diagram source for one inline figure. The Figure component
 * (src/components/BlogPost/Figure.tsx) already renders markdown alt text as
 * both the visible figcaption and the img aria label, so alt ALREADY is the
 * accessible diagram description. The narration reads it verbatim.
 *
 * `description` is the optional per-diagram override for a terse alt: if a
 * line immediately following a `![alt](<path>)` image starts with
 * `description:: `, the narration reads that instead of the bare alt.
 */
export interface SpokenDiagramSource {
  /** The figure's markdown alt text (the default spoken description). */
  alt: string;
  /** Optional per-diagram override (from a `description::` line). */
  description?: string;
}

/** Overrides for how MDX is turned into speakable prose. */
export interface NarrationOptions {
  /** Prefix/suffix wrapper for each diagram line. Default: (alt) => `Diagram: ${alt}.` */
  leadIn?: (alt: string) => string;
  /**
   * High-level diagram-source resolver. Defaults to reading
   * SpokenDiagramSource.alt (or .description when present). Keep as the
   * documented extension point; do not implement a second hearing unless a
   * real article needs it.
   */
  diagramSource?: (src: SpokenDiagramSource) => string;
}

/**
 * Signature implemented by the narration pure function (Phase 1, plan):
 * strips YAML frontmatter, renders headings as section cues, reads inline
 * code literally, drops citation-list verbatim reading, and injects a spoken
 * diagram description at each `![alt](path)`. Steel implements the body in
 * src/lib/audio-narration.ts; the contract here is the option + input types.
 */
export type MdxToNarration = (mdx: string, opts?: NarrationOptions) => string;