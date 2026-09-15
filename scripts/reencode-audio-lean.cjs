#!/usr/bin/env node
/**
 * scripts/reencode-audio-lean.cjs — re-encode the STORED narrations in the
 * private Supabase 'audio' bucket to the lean profile (mono / 24000 Hz / 48kbps)
 * WITHOUT re-running TTS.
 *
 * Why: the bucket has to hold a 91-article backfill inside the Supabase Free
 * 1 GB storage tier. At the original mono/24k/128kbps encoding that measures
 * ~13.3 MB per article (~1.19 GB for 91, over the cap); mono/24k/48kbps is
 * ~5 MB per article (~455 MB for 91, comfortable margin).
 *
 * What it does, per referenced MP3:
 *   1. download the object with the service-role key (private bucket read)
 *   2. ffprobe it; SKIP when it is already mono/24k at <= 64 kbps (idempotent)
 *   3. ffmpeg -ac 1 -ar 24000 -b:a 48k -codec:a libmp3lame -map_metadata -1
 *   4. assert the duration survived (no truncation), then upload with x-upsert
 *   5. re-list the bucket and assert the stored size equals the local size
 *
 * Only MP3s referenced by src/data/audio.ts are touched — orphans are left for
 * the caller to delete explicitly. Read-only against the DB/config; the only
 * mutation is the object upsert.
 *
 * Usage:
 *   node scripts/reencode-audio-lean.cjs                 # re-encode every referenced MP3
 *   node scripts/reencode-audio-lean.cjs --dry-run       # report only
 *   node scripts/reencode-audio-lean.cjs --bitrate 48k
 *   node scripts/reencode-audio-lean.cjs --json /tmp/reencode-report.json
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const AUDIO_TS = path.join(ROOT, "src", "data", "audio.ts");
const BUCKET = "audio";

const argv = process.argv.slice(2);
function opt(name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}
const dryRun = argv.includes("--dry-run");
const bitrate = opt("--bitrate", process.env.AUDIO_BITRATE || "48k");
/*
 * ffmpeg -b:a contract — the same allowlist build-audio.js applies before it
 * hands --bitrate to the engine. This tool already spawns ffmpeg via
 * execFileSync with an argv array (no shell), so this is defence in depth, not
 * the primary control: a value from --bitrate / AUDIO_BITRATE must never reach
 * ffmpeg as anything but a bitrate.
 */
const BITRATE_RE = /^\d{2,3}k$/;
if (!BITRATE_RE.test(bitrate)) {
  console.error(
    `FATAL: invalid bitrate ${JSON.stringify(bitrate)} rejected: must match ${BITRATE_RE} (e.g. "48k")`,
  );
  process.exit(2);
}
const jsonOut = opt("--json", null);
const limit = opt("--limit", null) ? parseInt(opt("--limit", null), 10) : null;
const SR = "24000";
const SKIP_MAX_BPS = 64000; // already lean enough -> no re-encode

function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, "utf-8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function referencedStoragePaths() {
  const src = fs.readFileSync(AUDIO_TS, "utf-8");
  const paths = [...src.matchAll(/storagePath: "([^"]+\.mp3)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`no storagePath entries found in ${AUDIO_TS}`);
  return paths;
}

function authHeaders(env) {
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  return { Authorization: `Bearer ${svc}`, apikey: svc };
}

async function download(env, key, dest) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    headers: authHeaders(env),
  });
  if (!res.ok) throw new Error(`download ${key} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function upload(env, key, buf) {
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "audio/mpeg", "x-upsert": "true" },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${key} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function listFolder(env, prefix, offset = 0) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list ${prefix} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Recursive bucket walk -> Map(key -> size). */
async function walk(env, prefix, acc = new Map()) {
  const rows = await listFolder(env, prefix);
  for (const r of rows) {
    const key = prefix ? `${prefix}/${r.name}` : r.name;
    if (r.id === null || r.id === undefined) await walk(env, key, acc);
    else acc.set(key, r.metadata?.size ?? null);
  }
  return acc;
}

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", file],
    { encoding: "utf-8" },
  );
  const j = JSON.parse(out);
  const s = j.streams.find((x) => x.codec_type === "audio") || j.streams[0];
  return {
    codec: s.codec_name,
    channels: s.channels,
    sampleRate: Number(s.sample_rate),
    bitRate: Number(s.bit_rate || j.format.bit_rate || 0),
    duration: Number(j.format.duration),
  };
}

function transcode(src, dest) {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", src, "-ac", "1", "-ar", SR, "-codec:a", "libmp3lame", "-b:a", bitrate,
     "-map_metadata", "-1", dest],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

(async () => {
  const env = loadEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required in .env.local");
  }
  const keys = referencedStoragePaths().slice(0, limit || undefined);
  const beforeSizes = await walk(env, "blog");
  const bytesBefore = [...beforeSizes.values()].reduce((n, s) => n + (s || 0), 0);
  console.log(`referenced mp3: ${keys.length}`);
  console.log(`bucket before:  ${beforeSizes.size} objects, ${(bytesBefore / 1048576).toFixed(1)} MB`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lean-"));
  const report = { bitrate, sr: Number(SR), dryRun, files: [], bytesBefore, bytesAfter: null, bucketAfter: null };
  let reclaimed = 0;

  for (const key of keys) {
    // Slug-scoped temp names: every object's basename is "<voice>.mp3", so
    // path.basename(key) would collide across articles (and would overwrite
    // the only copy of an original, which is needed for A/B quality checks).
    const slugDir = key.split("/").filter(Boolean).slice(1, -1).join("_") || "root";
    const name = path.basename(key);
    const local = path.join(tmp, `${slugDir}--${name}`);
    const out = path.join(tmp, `lean--${slugDir}--${name}`);
    const originalBytes = await download(env, key, local);
    const before = probe(local);

    if (before.channels === 1 && before.sampleRate === Number(SR) && before.bitRate <= SKIP_MAX_BPS) {
      console.log(`SKIP ${key}: already mono/${before.sampleRate}/${Math.round(before.bitRate / 1000)}k`);
      report.files.push({ key, status: "skip-already-lean", bytesBefore: originalBytes, bytesAfter: originalBytes, probe: before });
      continue;
    }

    transcode(local, out);
    const after = probe(out);
    if (Math.abs(after.duration - before.duration) > 0.15) {
      throw new Error(
        `${key}: duration changed ${before.duration}s -> ${after.duration}s (truncation guard) — aborting`,
      );
    }
    if (after.channels !== 1 || after.sampleRate !== Number(SR)) {
      throw new Error(`${key}: transcoded profile is ${after.channels}ch/${after.sampleRate}Hz — aborting`);
    }
    const outBuf = fs.readFileSync(out);
    const saved = originalBytes - outBuf.length;

    if (!dryRun) {
      await upload(env, key, outBuf);
      const check = await walk(env, path.dirname(key));
      const stored = check.get(key);
      if (stored !== outBuf.length) {
        throw new Error(`${key}: stored size ${stored} != local ${outBuf.length} (upload verify failed)`);
      }
    }
    reclaimed += saved;
    console.log(
      `${dryRun ? "WOULD" : "OK   "} ${key}: ${(originalBytes / 1048576).toFixed(2)} MB -> ` +
        `${(outBuf.length / 1048576).toFixed(2)} MB (${Math.round(after.bitRate / 1000)}k, dur ${after.duration.toFixed(1)}s)`,
    );
    report.files.push({
      key,
      status: dryRun ? "would-reencode" : "reencoded",
      bytesBefore: originalBytes,
      bytesAfter: outBuf.length,
      probe: after,
    });
  }

  const finalSizes = await walk(env, "blog");
  const bytesFinal = [...finalSizes.values()].reduce((n, s) => n + (s || 0), 0);
  report.bytesAfter = bytesFinal;
  report.bucketAfter = { objects: finalSizes.size, bytes: bytesFinal };
  report.reclaimedThisRun = reclaimed;
  console.log(`bucket after:   ${finalSizes.size} objects, ${(bytesFinal / 1048576).toFixed(1)} MB`);
  console.log(
    `reclaimed this run: ${(reclaimed / 1048576).toFixed(1)} MB  ` +
      `(bucket delta ${((bytesBefore - bytesFinal) / 1048576).toFixed(1)} MB)`,
  );
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(`wrote ${jsonOut}`);
  }
})().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});
