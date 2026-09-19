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
 *   - audio blobs live in a PRIVATE Cloudflare R2 bucket (`adroit-audio`,
 *     reached over its S3 API) and are served through the authenticated
 *     GET /api/audio/[slug] route. The Supabase Storage `audio` bucket is the
 *     generation-side SOURCE bucket (generator + migration tool) only — see
 *     AUDIO_BUCKET below.
 *   - narration reads each Figure's markdown alt text as the spoken diagram
 *     description (alt IS the accessible figure description already)
 *   - coverage is whatever the backfill cron has produced so far; there is no
 *     fixed pilot count — the generated src/data/audio.ts grows over time
 *
 * NO public URL and NO signed URL is EVER emitted — not by the route, not as a
 * fallback (read-path amendment by brainiac, t_61815573, after the R2 migration
 * in t_f11780b8 / commit 7ada82c). `articles.audioUrl` does not exist; the
 * player always fetches `/api/audio/<slug>`, and the route reads the private
 * object server-side with the bucket-scoped R2 credentials after an
 * authenticated session check.
 */

/* ------------------------------------------------------------------ */
/*  Storage layout                                                     */
/* ------------------------------------------------------------------ */

/**
 * Supabase Storage SOURCE bucket for narrated article audio.
 *
 * The GENERATOR (scripts/build-audio.js) uploads here, and
 * scripts/migrate-audio-to-r2.cjs copies from here into the R2 bucket. This is
 * NOT the read path: neither /api/audio/[slug] nor its /timings twin touches
 * Supabase Storage — both read the same keys from Cloudflare R2 with
 * getR2Object() (src/lib/r2/client.ts). The object bytes are deliberately
 * retained here only so a rollback stays a config revert.
 */
export const AUDIO_BUCKET = "audio" as const;

/** Default (and only) narrator voice for the pilot. Single voice, no selector. */
export const DEFAULT_VOICE = "af_heart" as const;

/**
 * Object key of one article narration, relative to a store root.
 * Scheme: blog/<slug>/<voice>.mp3  (example: blog/agent-eval-infrastructure-2026/af_heart.mp3)
 * One mp3 per published article, keyed by the post slug from src/data/posts.ts.
 * The SAME key resolves in both stores (Supabase source bucket + R2), which is
 * why the storage migration needed no change to src/data/audio.ts.
 */
export type AudioStorageKey = `blog/${string}/${string}.mp3`;

/**
 * Object key of one article's segment-timing manifest, relative to a store
 * root. Scheme: blog/<slug>/<voice>.timing.json
 * (example: blog/agent-eval-infrastructure-2026/af_heart.timing.json).
 * Written by engine_kokoro.py + uploaded by build-audio.js (Supabase source
 * bucket), mirrored to the same key in R2, and read from R2 by the server so
 * the client can snap a scrolled article to the exact spoken paragraph
 * (Tier C).
 */
export type AudioTimingStorageKey = `blog/${string}/${string}.timing.json`;

/**
 * A single narrated article. Generated as a static array by
 * scripts/build-audio.js and emitted to src/data/audio.ts:
 *
 *     export const articleAudio: ArticleAudio[] = [...];
 *
 * The page resolves the player via articleAudio.find((a) => a.slug === slug).
 * `storagePath` is the private-store key, used ONLY by the /api/audio route
 * when reading the object server-side. No public URL and no signed URL is ever
 * constructed from it.
 */
export interface ArticleAudio {
  /** Article slug; must match a slug in src/data/posts.ts and content/blog/<slug>.mdx. */
  slug: string;
  /** Kokoro voice id of the narration. Single narrator; DEFAULT_VOICE for the pilot. */
  voice: string;
  /** Object key of the narration: blog/<slug>/<voice>.mp3 (same key in the Supabase source bucket and in R2). */
  storagePath: AudioStorageKey;
  /**
   * Optional object key of the segment-timing manifest (Tier C exact
   * paragraph scroll-sync): blog/<slug>/<voice>.timing.json.
   * Absent for articles generated before timing capture landed; the client
   * degrades gracefully (no Follow-along) when it is missing. Like storagePath
   * it is a private-store key ONLY — never serialized to the client; the
   * manifest is read from R2 and served by the authed GET /api/audio/<slug>/timings
   * route.
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
/*  Lesson audio (Atlas / Learn tab) - parallel module, ADR-101         */
/* ------------------------------------------------------------------ */

/**
 * Object key of one lesson narration, relative to a store root.
 * Scheme: learn/<series>/<slug>/<voice>.mp3
 * (example: learn/salesforce-sharing-visibility-architect/day-01-p-1a-object-permissions-crud-system-vs-object-profiles/af_heart.mp3)
 * The series prefix is REQUIRED because the same lesson slug can appear in
 * multiple series (e.g. `framing-value-and-roi` exists in `hermes-consultant`
 * and `hermes-consultant-intermediate`). The SAME key resolves in both stores
 * (Supabase source bucket + R2), exactly like the `blog/` scheme.
 */
export type LessonAudioStorageKey = `learn/${string}/${string}/${string}.mp3`;

/**
 * Object key of one lesson's segment-timing manifest, relative to a store
 * root. Scheme: learn/<series>/<slug>/<voice>.timing.json
 * (example: learn/salesforce-sharing-visibility-architect/day-01-p-1a-object-permissions-crud-system-vs-object-profiles/af_heart.timing.json).
 * Mirrors AudioTimingStorageKey for the lesson key space.
 */
export type LessonAudioTimingStorageKey = `learn/${string}/${string}/${string}.timing.json`;

/**
 * A single narrated lesson. Generated as a static array by
 * scripts/build-audio.js --learn and emitted to src/data/lesson-audio.ts:
 *
 *     export const lessonAudio: LessonAudio[] = [...];
 *
 * The lesson page resolves the player via
 * lessonAudio.find((a) => a.series === series && a.slug === slug).
 * `storagePath` is the private-store key, used ONLY by the /api/audio route
 * when reading the object server-side. No public URL and no signed URL is ever
 * constructed from it.
 */
export interface LessonAudio {
  /** Series slug - content/learn/<series>/ dir name. */
  series: string;
  /** Lesson slug - MDX filename under content/learn/<series>/. */
  slug: string;
  /** Kokoro voice id. Single narrator; DEFAULT_VOICE for the pilot. */
  voice: string;
  /** Object key of the narration: learn/<series>/<slug>/<voice>.mp3 (same key in the Supabase source bucket and in R2). */
  storagePath: LessonAudioStorageKey;
  /**
   * Optional object key of the segment-timing manifest (Tier C exact
   * paragraph scroll-sync): learn/<series>/<slug>/<voice>.timing.json.
   * Absent for lessons generated before timing capture landed; the client
   * degrades gracefully (no Follow-along) when it is missing. Like
   * storagePath it is a private-store key ONLY - never serialized to the
   * client; the manifest is read from R2 and served by the authed
   * GET /api/audio/<slug>/timings route.
   */
  timingsStoragePath?: LessonAudioTimingStorageKey;
}

/** Compile-time guard: every lesson audio entry must resolve to a private-bucket key. */
export type LessonAudioList = readonly LessonAudio[];

/* ------------------------------------------------------------------ */
/*  GET /api/audio/[slug] route contract                               */
/* ------------------------------------------------------------------ */

/** Route handler param shape (Next 16 App Router uses a Promise params). */
export interface AudioRouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * Response matrix for GET /api/audio/<slug>. The route is DYNAMIC (it depends
 * on the visitor's session), does NOT emit a public or signed URL, and streams
 * the private object back as audio/mpeg with a private cache control:
 *
 *   200  audio/mpeg, "Cache-Control: private, max-age=3600"
 *        signed-in + slug present in articleAudio + object retrievable.
 *   401  unauthenticated / invalid session (no cookie, rejected token).
 *   404  unknown slug (not in articleAudio) OR private object missing.
 *
 * Auth resolution: getSupabaseServerClient().auth.getUser() (HttpOnly cookie,
 * same mechanism as every other authed route).
 *
 * Object read: getR2Object(storagePath) from src/lib/r2/client.ts — an S3
 * GetObject against the PRIVATE Cloudflare R2 bucket `adroit-audio` (env
 * R2_BUCKET), with bucket-scoped credentials (Object Read on that one bucket,
 * ListBuckets denied by design), path-style addressing and region "auto". The
 * bytes are fetched INSIDE the handler and returned as fixed `audio/mpeg`; the
 * object never leaves the server as a URL. `getR2Object` returns null for a
 * missing key (→ 404) and throws on any other failure (→ the handler fails
 * closed to 401).
 *
 * NO public URL AND NO SIGNED URL, EVER — including as a fallback. The
 * migration-era note that allowed a server-minted short-lived signed download
 * URL is REVOKED: a signed URL puts the blob behind a bearer token that
 * outlives the session check, so the buffered server-side read is the only
 * sanctioned body path. Do not add getPublicUrl / presign anywhere.
 *
 * Range: the route additionally honors a single HTTP byte range and answers
 * 206 + Content-Range (416 for an unsatisfiable range) — see the route header
 * for the exact rules (If-Range and malformed ranges degrade to a full 200).
 * This type enumerates the auth/presence outcomes the player depends on; 206
 * and 416 are transport-level details of a successful read.
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
  /**
   * Lesson-aware section routing (ADR-106/107). When truthy, the narration
   * reads only LEARNING content: the interactive sections a listener cannot
   * act on (`Try It`, `Related Requirements`, `References`) are cut — `Try
   * It` is replaced by a single spoken bridge line, the other two emit
   * nothing — and the knowledge-check transition is appended once as the
   * final line. `What's Next` is still read (recap + preview). Articles omit
   * this; the article path is byte-for-byte unchanged when it is falsy.
   */
  lesson?: boolean;
  /** Spoken line that replaces the `Try It` section body in lesson mode. */
  tryItBridge?: string;
  /**
   * Spoken framing line prepended before a Configuration Walkthrough section
   * in lesson mode (ADR-106/107 keep + bridge). The walkthrough body is NOT
   * cut (unlike Try It) — the bridge reframes the mouse-click steps for a
   * listener, then the section content (sequence + why + traps) is read as
   * normal. Defaults to a single em-dash-free line.
   */
  walkthroughBridge?: string;
  /** Closing knowledge-check hand-off, appended last in lesson mode. */
  knowledgeCheckTransition?: string;
}

/**
 * Signature implemented by the narration pure function (Phase 1, plan):
 * strips YAML frontmatter, renders headings as section cues, reads inline
 * code literally, drops citation-list verbatim reading, and injects a spoken
 * diagram description at each `![alt](path)`. Steel implements the body in
 * src/lib/audio-narration.ts; the contract here is the option + input types.
 */
export type MdxToNarration = (mdx: string, opts?: NarrationOptions) => string;