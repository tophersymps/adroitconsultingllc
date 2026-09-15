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
 *  - BOTH halves of the migration live here: `getR2Object` is the READ path
 *    (the two /api/audio routes) and `putR2Object` / `headR2Object` are the
 *    WRITE path (`scripts/build-audio.js` and `scripts/migrate-audio-to-r2.cjs`
 *    share them instead of each building their own S3 client). One place owns
 *    the endpoint, the credentials plumbing and the "verify the PUT by
 *    re-reading R2" rule.
 *
 * Usage: const object = await getR2Object(entry.storagePath); // null == 404
 *        await putR2Object({ key, body: mp3Buf, contentType: "audio/mpeg" });
 */
import {
  GetObjectCommand,
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
 * throttling) is rethrown by getR2Object so it fails closed rather than
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
 * Fetch one object from the private R2 bucket, server-side.
 *
 * Returns `null` when the key does not exist (the route maps that to 404).
 * Throws on any other failure. Never returns or emits a URL.
 */
export async function getR2Object(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<R2Object | null> {
  const { bucket } = readR2Config(env);

  let response;
  try {
    response = await getR2Client(env).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    if (isMissingObjectError(err)) return null;
    throw err;
  }

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
