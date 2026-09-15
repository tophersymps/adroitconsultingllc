/**
 * src/lib/r2/client.ts — Cloudflare R2 (S3 API) object reader.
 *
 * WHY THIS EXISTS
 * The narrated article MP3s used to be read out of the PRIVATE Supabase
 * Storage 'audio' bucket with the service-role client. Supabase's Free tier
 * bills storage AND egress (1 GB / 5 GB), which caps the audio library at
 * roughly 385 listens. R2 gives 10 GB of storage with zero egress fees, so the
 * blobs were migrated to the `adroit-audio` bucket and the routes now read
 * from R2.
 *
 * CONTRACT (do not weaken — mirrors docs/audio.md and the route headers)
 *  - Server-side ONLY. The bucket stays private; the object bytes are fetched
 *    inside the route handler with scoped credentials and returned as fixed
 *    `audio/mpeg` (or application/json) bytes. This module never mints, signs
 *    or returns a URL. There is no getPublicUrl / presign path here, and none
 *    should be added: the auth gate only means something if the bytes never
 *    leave the server without it.
 *  - Keys are the SAME as the Supabase layout (`blog/<slug>/<voice>.mp3`,
 *    `blog/<slug>/<voice>.timing.json`) so src/data/audio.ts is unchanged.
 *  - Fails CLOSED. A missing env var throws on first use, never at module
 *    import — `next build` imports route modules to collect page data in
 *    environments that have no runtime secrets, so a module-scope throw would
 *    break the build (same reasoning as src/lib/supabase/server.ts).
 *  - The S3 keys are BUCKET-SCOPED (Object Read & Write on `adroit-audio`
 *    only). `ListBuckets` is expected to return AccessDenied by design; only
 *    GetObject/PutObject/DeleteObject/HeadObject on this one bucket are granted.
 *    That is why this module wraps GetObject and the migration tool falls back
 *    to per-key HeadObject when ListObjectsV2 is refused.
 *  - BOTH halves of the migration live here: the read path is
 *    `getR2ObjectStream` / `getR2ObjectRange` (the /api/audio/[slug] route —
 *    the object body is STREAMED to the client and, for a Range request, R2 is
 *    asked for ONLY that byte span) plus the buffered `getR2Object` (the small
 *    /timings manifest, which the route parses as JSON anyway), and
 *    `putR2Object` / `headR2Object` are the WRITE path (`scripts/build-audio.js`
 *    and `scripts/migrate-audio-to-r2.cjs` share them instead of each building
 *    their own S3 client). One place owns the endpoint, the credentials
 *    plumbing and the "verify the PUT by re-reading R2" rule.
 *
 * Usage: const object = await getR2ObjectStream(entry.storagePath); // null == 404
 *        const span = await getR2ObjectRange(key, { start: 0, end: 99 });
 *        await putR2Object({ key, body: mp3Buf, contentType: "audio/mpeg" });
 */
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/** R2 ignores the region for SigV4 but the SDK requires one; "auto" is R2's. */
export const R2_REGION = "auto";

/** Env var names, exported so the migration tooling and tests share one list. */
export const R2_ENV_KEYS = {
  accountId: "R2_ACCOUNT_ID",
  bucket: "R2_BUCKET",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
} as const;

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `https://<accountId>.r2.cloudflarestorage.com` */
  endpoint: string;
}

/** The S3 API endpoint for an R2 account. */
export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/**
 * Read and validate the R2 config from the environment. Throws when any of the
 * four values is missing so a misconfigured runtime surfaces as a hard failure
 * (the route turns that into a fail-closed 401) instead of silently serving
 * nothing or falling back to another store.
 */
export function readR2Config(env: NodeJS.ProcessEnv = process.env): R2Config {
  const accountId = env[R2_ENV_KEYS.accountId];
  const bucket = env[R2_ENV_KEYS.bucket];
  const accessKeyId = env[R2_ENV_KEYS.accessKeyId];
  const secretAccessKey = env[R2_ENV_KEYS.secretAccessKey];

  const missing = [
    [R2_ENV_KEYS.accountId, accountId],
    [R2_ENV_KEYS.bucket, bucket],
    [R2_ENV_KEYS.accessKeyId, accessKeyId],
    [R2_ENV_KEYS.secretAccessKey, secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`R2 configuration is incomplete: missing ${missing.join(", ")}`);
  }

  return {
    accountId: accountId!,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    endpoint: r2Endpoint(accountId!),
  };
}

let clients = new Map<string, S3Client>();

/**
 * Lazily create (and memoize) the S3 client pointed at R2. Path-style
 * addressing is forced because the R2 S3 endpoint serves
 * `<bucket>.r2.cloudflarestorage.com` without a valid wildcard certificate for
 * arbitrary bucket names.
 *
 * `env` is a parameter so the generator and the migration tool can hand over
 * the env they loaded from `.env.local` themselves (scripts run outside Next,
 * so nothing has populated `process.env` for them). The memo is keyed on the
 * resolved endpoint + key id + bucket, so a caller with different credentials
 * gets its own client instead of silently reusing another one's.
 */
export function getR2Client(env: NodeJS.ProcessEnv = process.env): S3Client {
  const config = readR2Config(env);
  const cacheKey = `${config.endpoint}|${config.bucket}|${config.accessKeyId}`;
  let cached = clients.get(cacheKey);
  if (!cached) {
    cached = new S3Client({
      region: R2_REGION,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    clients.set(cacheKey, cached);
  }
  return cached;
}

/** Test seam: drop the memoized clients (env changes between tests). */
export function resetR2Client(): void {
  clients = new Map();
}

/**
 * Content-Type by key extension. Shared by the write path (generator +
 * migration tool) so a copied object keeps the header the reader's routes emit.
 */
export function contentTypeForKey(key: string): string {
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

export interface R2Object {
  /** Full object bytes. */
  bytes: Uint8Array;
  /** Object size in bytes (Content-Length, falling back to the decoded length). */
  size: number;
}

/**
 * True when an S3 error means "this object does not exist" (GetObject/Head of a
 * missing key answers 404 NoSuchKey; a short read can surface as
 * "The specified key does not exist"). Any OTHER error (auth, network,
 * throttling) is rethrown by the read helpers so it fails closed rather than
 * masquerading as a missing object.
 */
export function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const code = candidate.name ?? candidate.Code ?? "";
  return (
    code === "NoSuchKey" ||
    code === "NotFound" ||
    code === "NoSuchBucket" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

/**
 * One GetObject against the private bucket. Returns the raw S3 response, or
 * `null` when the key does not exist; any OTHER failure (auth, network,
 * throttling) is rethrown so the caller fails closed rather than mistaking it
 * for a missing object. Shared by the buffered and the streaming readers so the
 * bucket, the error mapping and the "optional Range" shape have exactly one
 * implementation.
 */
async function requestGetObject(
  key: string,
  env: NodeJS.ProcessEnv,
  rangeHeader?: string,
): Promise<GetObjectCommandOutput | null> {
  const { bucket } = readR2Config(env);
  try {
    return await getR2Client(env).send(
      // `Range` is only added when asked for, so a plain read issues the same
      // GetObjectCommand input it always did.
      new GetObjectCommand({ Bucket: bucket, Key: key, ...(rangeHeader ? { Range: rangeHeader } : {}) }),
    );
  } catch (err) {
    if (isMissingObjectError(err)) return null;
    throw err;
  }
}

/**
 * Convert the SDK payload into a web ReadableStream. In the Node runtime the
 * SDK hands back a `Readable`, which `node:stream` converts (undici — and so
 * `new Response(...)` — accepts a web ReadableStream directly). Kept structural
 * rather than cast-heavy because the SDK's `Body` union covers Node, web and
 * Blob runtimes.
 */
function toWebStream(body: unknown): ReadableStream<Uint8Array> | null {
  if (!body) return null;
  if (body instanceof ReadableStream) return body as ReadableStream<Uint8Array>;
  if (body instanceof Readable) return Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;
  // Unknown runtime payload (e.g. a Blob): hand it over as-is and let the
  // Response constructor reject it loudly rather than silently serving nothing.
  return body as ReadableStream<Uint8Array>;
}

/**
 * Fetch one object from the private R2 bucket, server-side, WHOLE and BUFFERED.
 *
 * Returns `null` when the key does not exist (the route maps that to 404).
 * Throws on any other failure. Never returns or emits a URL.
 *
 * Used by the /timings route: the manifest is a few hundred bytes of JSON that
 * the route parses immediately, so buffering it is free. Anything serving
 * potentially large bytes should use `getR2ObjectStream` / `getR2ObjectRange`.
 */
export async function getR2Object(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<R2Object | null> {
  const response = await requestGetObject(key, env);
  if (!response) return null;

  // The SDK mixes `transformToByteArray()` onto the payload stream; the union
  // type does not always surface it, hence the narrow structural cast.
  const body = response.Body as { transformToByteArray(): Promise<Uint8Array> } | undefined;
  if (!body) return null;

  const bytes = await body.transformToByteArray();
  return {
    bytes,
    size: response.ContentLength ?? bytes.byteLength,
  };
}

/* ------------------------------------------------------------------ */
/*  STREAMING READ — the /api/audio/[slug] route. Never buffers the     */
/*  object on the server and never transfers more than the client asked */
/*  for. Same null-on-missing / throw-on-anything-else contract.        */
/* ------------------------------------------------------------------ */

/** An inclusive byte span: `bytes=<start>-<end>`. */
export interface R2ByteRange {
  start: number;
  end: number;
}

/** The single-range HTTP form of a span — what R2's GetObject `Range` takes. */
export function formatRangeHeader(range: R2ByteRange): string {
  return `bytes=${range.start}-${range.end}`;
}

export interface R2ObjectStream {
  /** The object body as a web ReadableStream — pipe it straight into a Response. */
  stream: ReadableStream<Uint8Array>;
  /**
   * Bytes this body will deliver. R2's Content-Length for the response (i.e.
   * the span length for a range request); 0 when R2 reported none, in which
   * case the caller must not emit a Content-Length header.
   */
  size: number;
}

/**
 * Stream the WHOLE object (no buffering). Returns `null` for a missing key and
 * throws on any other failure — the same contract as `getR2Object`.
 */
export async function getR2ObjectStream(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<R2ObjectStream | null> {
  const response = await requestGetObject(key, env);
  if (!response) return null;

  const stream = toWebStream(response.Body);
  if (!stream) return null;

  return { stream, size: response.ContentLength ?? 0 };
}

/**
 * Stream ONLY `range.start`..`range.end` (inclusive) of the object: the Range is
 * passed through to R2's GetObject, so a `bytes=0-99` metadata probe or a seek
 * transfers ~100 bytes instead of the whole 5-15 MB file, and the server holds
 * no more than a chunk of it in memory.
 *
 * Returns `null` for a missing key and throws on any other failure. The caller
 * owns the HTTP semantics (206 / Content-Range / 416) — this helper just asks
 * R2 for the span it is given.
 */
export async function getR2ObjectRange(
  key: string,
  range: R2ByteRange,
  env: NodeJS.ProcessEnv = process.env,
): Promise<R2ObjectStream | null> {
  const response = await requestGetObject(key, env, formatRangeHeader(range));
  if (!response) return null;

  const stream = toWebStream(response.Body);
  if (!stream) return null;

  return {
    stream,
    size: response.ContentLength ?? range.end - range.start + 1,
  };
}

/* ------------------------------------------------------------------ */
/*  WRITE PATH — shared by scripts/build-audio.js and                   */
/*  scripts/migrate-audio-to-r2.cjs. Never returns or emits a URL.      */
/* ------------------------------------------------------------------ */

export interface R2ObjectHead {
  /** Object size in bytes (Content-Length). */
  size: number;
  /** R2's ETag for the stored object (an MD5 for a single-part PUT). */
  etag?: string;
  /** Content-Type stored with the object, when R2 reports one. */
  contentType?: string;
  /** User metadata set by putR2Object's caller (e.g. `sha256`). */
  metadata?: Record<string, string>;
}

export interface PutR2ObjectInput {
  /** Bucket-relative key — same layout as the reader uses. */
  key: string;
  /** Raw object bytes (a Buffer is fine; it is a Uint8Array). */
  body: Uint8Array;
  /** Defaults to `contentTypeForKey(key)`. */
  contentType?: string;
  /** Optional user metadata, e.g. `{ sha256: "<hex>" }`. */
  metadata?: Record<string, string>;
}

/**
 * Head one object. Returns `null` for a key R2 does not hold, and rethrows any
 * other failure (auth, network) so a broken credential can never be mistaken
 * for "the object is missing" — the migration tool's skip/verify logic depends
 * on that distinction.
 */
export async function headR2Object(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<R2ObjectHead | null> {
  const { bucket } = readR2Config(env);

  let response;
  try {
    response = await getR2Client(env).send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (isMissingObjectError(err)) return null;
    throw err;
  }

  return {
    size: response.ContentLength ?? 0,
    etag: response.ETag,
    contentType: response.ContentType,
    metadata: response.Metadata,
  };
}

/**
 * Write one object to the private R2 bucket, then VERIFY it by re-reading R2
 * (HeadObject) instead of trusting the PUT response — the same rule the
 * migration tool applies to every copy. Throws when the stored size differs
 * from what was sent, so a truncated or silently-dropped upload aborts the
 * caller rather than emitting an entry whose audio is unreadable.
 */
export async function putR2Object(
  input: PutR2ObjectInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<R2ObjectHead> {
  const { key, body } = input;
  const { bucket } = readR2Config(env);

  await getR2Client(env).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: input.contentType ?? contentTypeForKey(key),
      ContentLength: body.byteLength,
      Metadata: input.metadata,
    }),
  );

  const stored = await headR2Object(key, env);
  if (!stored || stored.size !== body.byteLength) {
    throw new Error(
      `R2 put verification failed for ${key}: R2 reports ${
        stored ? `${stored.size} bytes` : "no object"
      }, expected ${body.byteLength}`,
    );
  }
  return stored;
}
