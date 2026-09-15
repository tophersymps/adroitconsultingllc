#!/usr/bin/env node
/**
 * migrate-audio-to-r2.cjs — copy the private Supabase Storage 'audio' bucket
 * into the Cloudflare R2 'adroit-audio' bucket (S3 API), then PROVE the copy
 * by re-listing R2 and comparing key set + per-object byte size against the
 * live Supabase listing.
 *
 * WHY
 * Supabase's Free tier bills storage AND egress (1 GB / 5 GB), which caps the
 * narrated-article library at roughly 385 listens. R2 gives 10 GB with zero
 * egress fees. Reading moves to R2 (src/lib/r2/client.ts); Supabase Storage
 * keeps every object so a rollback is a config revert (re-point the reader),
 * not a restore.
 *
 * USAGE
 *   node --env-file=.env.local scripts/migrate-audio-to-r2.cjs [flags]
 *
 *   (no flags)      copy anything missing/different, then verify
 *   --verify-only   no writes; list both stores and compare
 *   --dry-run       report what would be copied, write nothing
 *   --prefix=blog/  restrict to a key prefix (default: whole bucket)
 *   --concurrency=N parallel object copies (default 4)
 *
 * ENV (never commit these)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Supabase source
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   R2 dest
 *
 * IDEMPOTENT: an object already present in R2 with a matching byte size is
 * skipped, so re-running after the audio backfill cron adds articles is cheap
 * and safe. Exit code is non-zero when the post-copy verification mismatches.
 */
"use strict";

const crypto = require("node:crypto");
const {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value === undefined ? true : value;
};

const DRY_RUN = Boolean(flag("dry-run", false));
const VERIFY_ONLY = Boolean(flag("verify-only", false));
const PREFIX = String(flag("prefix", ""));
const CONCURRENCY = Number(flag("concurrency", 4));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SOURCE_BUCKET = "audio";
const R2_ACCOUNT_ID = requireEnv("R2_ACCOUNT_ID");
const R2_BUCKET = requireEnv("R2_BUCKET");
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const supaHeaders = {
  Authorization: `Bearer ${SUPABASE_KEY}`,
  apikey: SUPABASE_KEY,
};

function contentTypeFor(key) {
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/* ------------------------------------------------------------------ */
/*  Supabase Storage (source)                                          */
/* ------------------------------------------------------------------ */

/**
 * Recursively list the private bucket. The Storage list endpoint returns
 * sub-folders as entries with `id: null`, so descend on those.
 */
async function listSupabase(prefix = "", out = []) {
  const limit = 100;
  let offset = 0;
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${SOURCE_BUCKET}`, {
      method: "POST",
      headers: { ...supaHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) {
      throw new Error(`supabase list(${prefix}) HTTP ${res.status}: ${await res.text()}`);
    }
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`supabase list(${prefix}) returned non-array`);

    for (const entry of page) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null || entry.id === undefined) {
        await listSupabase(key, out);
      } else {
        out.push({ key, size: entry.metadata?.size ?? -1, updatedAt: entry.updated_at });
      }
    }

    if (page.length < limit) break;
    offset += limit;
  }
  return out;
}

async function downloadSupabase(key) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SOURCE_BUCKET}/${encoded}`, {
    headers: supaHeaders,
  });
  if (!res.ok) throw new Error(`supabase download(${key}) HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/*  R2 (destination)                                                   */
/* ------------------------------------------------------------------ */

/** HeadObject is granted by "Object Read"; ListBucket may not be. */
async function headR2(key) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return { size: res.ContentLength, etag: res.ETag, metadata: res.Metadata };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Enumerate R2. Prefers ListObjectsV2 (paginated); the provisioned keys are
 * bucket-scoped and may deny ListBucket, in which case we fall back to a
 * HeadObject sweep over the Supabase key list — still a fresh read of R2,
 * just driven by the source manifest.
 */
async function listR2(fallbackKeys) {
  try {
    const found = [];
    let token;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET,
          Prefix: PREFIX,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const obj of page.Contents ?? []) found.push({ key: obj.Key, size: obj.Size });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return { method: "ListObjectsV2", objects: found };
  } catch (err) {
    if (err?.name !== "AccessDenied" && err?.$metadata?.httpStatusCode !== 403) throw err;
    const objects = [];
    for (const key of fallbackKeys) {
      const head = await headR2(key);
      if (head) objects.push({ key, size: head.size });
    }
    return { method: "HeadObject sweep (ListBucket denied by design)", objects };
  }
}

/* ------------------------------------------------------------------ */
/*  Copy                                                               */
/* ------------------------------------------------------------------ */

async function copyOne(source) {
  const existing = await headR2(source.key);
  if (existing && existing.size === source.size) {
    return { key: source.key, size: source.size, action: "skipped" };
  }
  if (DRY_RUN) {
    return {
      key: source.key,
      size: source.size,
      action: existing ? "would-overwrite" : "would-copy",
    };
  }

  const bytes = await downloadSupabase(source.key);
  if (bytes.byteLength !== source.size) {
    throw new Error(
      `size drift reading ${source.key}: supabase listing says ${source.size}, download returned ${bytes.byteLength}`,
    );
  }
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: source.key,
      Body: bytes,
      ContentType: contentTypeFor(source.key),
      ContentLength: bytes.byteLength,
      Metadata: { sha256, source: `supabase:${SOURCE_BUCKET}` },
    }),
  );

  // Verify the stored object by re-reading R2, never by trusting the PUT.
  const after = await headR2(source.key);
  if (!after || after.size !== bytes.byteLength) {
    throw new Error(
      `put verification failed for ${source.key}: R2 reports ${after ? after.size : "missing"} bytes, expected ${bytes.byteLength}`,
    );
  }
  return {
    key: source.key,
    size: after.size,
    sha256,
    action: existing ? "overwritten" : "copied",
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

(async () => {
  const source = (await listSupabase(PREFIX.replace(/\/$/, ""))).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  const sourceBytes = source.reduce((sum, o) => sum + o.size, 0);
  console.log(
    `supabase: ${source.length} objects, ${(sourceBytes / 1048576).toFixed(1)} MB (prefix "${PREFIX}")`,
  );

  let copies = [];
  if (!VERIFY_ONLY) {
    copies = await mapLimit(source, CONCURRENCY, copyOne);
    const written = copies.filter((c) => c.action === "copied" || c.action === "overwritten");
    const writtenBytes = written.reduce((sum, c) => sum + c.size, 0);
    const pending = copies.filter((c) => c.action.startsWith("would-"));
    console.log(
      `copy: ${written.length} written (${(writtenBytes / 1048576).toFixed(1)} MB), ${
        copies.length - written.length - pending.length
      } already identical${pending.length ? `, ${pending.length} pending (dry run)` : ""}`,
    );
  }

  const listing = await listR2(source.map((o) => o.key));
  const dest = new Map(listing.objects.map((o) => [o.key, o.size]));
  const destBytes = listing.objects.reduce((sum, o) => sum + o.size, 0);

  const missing = source.filter((o) => !dest.has(o.key));
  const sizeMismatch = source.filter((o) => dest.has(o.key) && dest.get(o.key) !== o.size);
  const extra = listing.objects.filter((o) => !source.some((s) => s.key === o.key));

  console.log(`r2: ${listing.objects.length} objects, ${(destBytes / 1048576).toFixed(1)} MB`);
  console.log(`r2 enumeration: ${listing.method}`);
  console.log(`verify: missing=${missing.length} size_mismatch=${sizeMismatch.length} extra=${extra.length}`);
  for (const o of missing.slice(0, 10)) console.log(`  MISSING ${o.key} (${o.size} bytes)`);
  for (const o of sizeMismatch.slice(0, 10)) {
    console.log(`  MISMATCH ${o.key} supabase=${o.size} r2=${dest.get(o.key)}`);
  }
  for (const o of extra.slice(0, 10)) console.log(`  EXTRA ${o.key} (${o.size} bytes)`);

  const ok = missing.length === 0 && sizeMismatch.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        source_objects: source.length,
        source_bytes: sourceBytes,
        r2_objects: listing.objects.length,
        r2_bytes: destBytes,
        r2_enumeration: listing.method,
        copied: copies.filter((c) => c.action === "copied").length,
        overwritten: copies.filter((c) => c.action === "overwritten").length,
        skipped: copies.filter((c) => c.action === "skipped").length,
        missing: missing.length,
        size_mismatch: sizeMismatch.length,
        extra_in_r2: extra.length,
        dry_run: DRY_RUN,
        verify_only: VERIFY_ONLY,
      },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error("MIGRATION FAILED:", err);
  process.exit(2);
});
