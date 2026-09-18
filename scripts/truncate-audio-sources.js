#!/usr/bin/env node
/**
 * scripts/truncate-audio-sources.js — one-time migration that cuts the
 * trailing "Sources" citation block out of EXISTING narrated article MP3s
 * WITHOUT re-synthesizing them.
 *
 * WHY
 * A pre-fix regression in src/lib/audio-narration.ts read each article's GFM
 * footnote *definition* lines (`[^n]: <citation>`) aloud, so every narrated
 * MP3 ends with a run of segments reciting source titles + URLs. Re-running
 * the TTS for 90+ articles is wasteful; instead we cut each stored MP3 at the
 * exact second where article content ends and the source block begins, using
 * the per-segment timing manifest that already exists in the bucket.
 *
 * HOW
 * For each entry in src/data/audio.ts:
 *   1. fetch the stored timing manifest (blog/<slug>/<voice>.timing.json)
 *   2. compute the article's FIXED narration and find the cut boundary via
 *      src/lib/audio-source-cut.ts computeCut() (pure, unit-tested)
 *   3. ffmpeg stream-copy the MP3 up to that cutSec (no re-encode, keeps the
 *      lean mono/48k profile)
 *   4. trim the timing manifest to the content segments
 *   5. re-upload BOTH to R2 (primary, verified) and, while the dual-write
 *      window is open, the private Supabase 'audio' bucket (rollback leg)
 *
 * SAFETY
 * - computeCut() refuses (returns null) unless the boundary is provable: the
 *   last content segment is grounded on the article's real final line AND
 *   every trailing segment reads like a citation. Unprovable articles are
 *   logged to .audio-out-trunc/review-log.json and left untouched.
 * - No shell is spawned; ffmpeg runs via execFileSync with an argv array.
 * - Every R2 PUT is verified by re-reading R2 (putR2Object).
 *
 * Usage:
 *   node scripts/truncate-audio-sources.js --dry-run          # decide only, no upload
 *   node scripts/truncate-audio-sources.js                    # cut + upload everything
 *   node scripts/truncate-audio-sources.js --slug a,b,c       # limit to specific slugs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "src", "data", "audio.ts");
const ENV_PATH = path.join(ROOT, ".env.local");
const OUT_DIR = path.join(ROOT, ".audio-out-trunc");
const BUCKET = "audio";

/* --- minimal .env.local loader (avoids a dep) --- */
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

/* --- parse existing src/data/audio.ts entries --- */
function readExistingEntries() {
  if (!fs.existsSync(OUT_PATH)) return [];
  const raw = fs.readFileSync(OUT_PATH, "utf-8");
  const out = [];
  const re = /\{\s*slug:\s*"([^"]+)",\s*voice:\s*"([^"]+)",\s*storagePath:\s*"([^"]+)"(?:,\s*timingsStoragePath:\s*"([^"]+)")?\s*\}/g;
  let m;
  while ((m = re.exec(raw))) {
    const e = { slug: m[1], voice: m[2], storagePath: m[3] };
    if (m[4]) e.timingsStoragePath = m[4];
    out.push(e);
  }
  return out;
}

/** True unless AUDIO_DUAL_WRITE_SUPABASE is explicitly switched off. */
function dualWriteSupabaseEnabled(env) {
  const raw = String(env.AUDIO_DUAL_WRITE_SUPABASE ?? "").trim();
  if (!raw) return true;
  return !/^(0|false|no|off)$/i.test(raw);
}

/** Supabase Storage upload (REST, service-role) — the rollback dual-write leg. */
async function uploadSupabase(env, storagePath, buf, contentType) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required in .env.local");
  }
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${svc}`,
      apikey: svc,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`supabase upload ${storagePath} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const dryRun = args.includes("--dry-run");
const slugOnly = flag("--slug");

async function main() {
  const env = loadEnv();
  const dualWrite = dualWriteSupabaseEnabled(env);
  const r2 = await import(fileURLToPath(new URL("../src/lib/r2/client.ts", import.meta.url)));
  const { computeCut } = await import(
    fileURLToPath(new URL("../src/lib/audio-source-cut.ts", import.meta.url))
  );
  const { mdxToNarration } = await import(
    fileURLToPath(new URL("../src/lib/audio-narration.ts", import.meta.url))
  );

  const entries = readExistingEntries();
  const byKey = new Map();
  for (const e of entries) byKey.set(`${e.slug}/${e.voice}`, e);
  const runSlugs = slugOnly ? new Set(slugOnly.split(",").map((s) => s.trim())) : null;

  let truncated = 0;
  let noSources = 0;
  let needsReview = 0;
  const reviewLog = [];

  for (const entry of byKey.values()) {
    const { slug, voice, storagePath, timingsStoragePath } = entry;
    if (runSlugs && !runSlugs.has(slug)) continue;

    if (!timingsStoragePath) {
      reviewLog.push({ slug, voice, reason: "no timingsStoragePath in audio.ts" });
      needsReview++;
      continue;
    }

    // 1. fetch the stored timing manifest
    let timingsObj;
    try {
      timingsObj = await r2.getR2Object(timingsStoragePath, env);
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `fetch timings failed: ${e.message}` });
      needsReview++;
      continue;
    }
    if (!timingsObj) {
      reviewLog.push({ slug, voice, reason: "timings manifest 404 in R2" });
      needsReview++;
      continue;
    }
    let segs;
    try {
      segs = JSON.parse(Buffer.from(timingsObj.bytes).toString("utf-8"));
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `timings not parseable: ${e.message}` });
      needsReview++;
      continue;
    }
    if (!Array.isArray(segs) || !segs.length || typeof segs[0]?.startSec !== "number") {
      reviewLog.push({ slug, voice, reason: "timing manifest not in expected segment shape" });
      needsReview++;
      continue;
    }

    // 2. compute the fixed narration and the cut boundary
    let mdx;
    try {
      mdx = fs.readFileSync(path.join(ROOT, "content", "blog", `${slug}.mdx`), "utf-8");
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `missing article: ${e.message}` });
      needsReview++;
      continue;
    }
    let fixedLines;
    try {
      fixedLines = mdxToNarration(mdx).split("\n");
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `narration failed: ${e.message}` });
      needsReview++;
      continue;
    }
    const cut = computeCut(segs, fixedLines);
    if (!cut) {
      reviewLog.push({
        slug,
        voice,
        reason: "no safe cut (no content-tail match or non-citation tail) — review",
      });
      needsReview++;
      continue;
    }
    const dropped = segs.length - (cut.cutIndex + 1);
    if (dropped <= 0) {
      noSources++;
      continue;
    }

    // 3. fetch the MP3 and truncate it at cutSec (stream copy, no re-encode)
    let mp3Obj;
    try {
      mp3Obj = await r2.getR2Object(storagePath, env);
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `fetch mp3 failed: ${e.message}` });
      needsReview++;
      continue;
    }
    if (!mp3Obj) {
      reviewLog.push({ slug, voice, reason: "mp3 404 in R2" });
      needsReview++;
      continue;
    }
    const originalBytes = Buffer.from(mp3Obj.bytes);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const srcPath = path.join(OUT_DIR, `${slug}.orig.mp3`);
    const cutPath = path.join(OUT_DIR, `${slug}.cut.mp3`);
    fs.writeFileSync(srcPath, originalBytes);
    let cutBytes;
    try {
      execFileSync(
        "ffmpeg",
        ["-y", "-i", srcPath, "-t", String(cut.cutSec), "-c", "copy", "-map_metadata", "-1", cutPath],
        { timeout: 120000, stdio: ["ignore", "ignore", "inherit"] },
      );
      cutBytes = fs.readFileSync(cutPath);
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `ffmpeg truncate failed: ${e.message}` });
      needsReview++;
      continue;
    }
    const trimmedSegs = segs.slice(0, cut.cutIndex + 1);
    const trimmedBuf = Buffer.from(JSON.stringify(trimmedSegs, null, 2));

    if (dryRun) {
      console.log(
        `DRY ${slug}: cut ${cut.cutSec}s (seg ${cut.cutIndex}, drop ${dropped} source segs) | ` +
          `mp3 ${originalBytes.length}->${cutBytes.length}B | last kept: "${segs[cut.cutIndex].text.slice(0, 80)}"`,
      );
      truncated++;
      continue;
    }

    // 4. upload the truncated MP3 (R2 primary, verified; Supabase rollback)
    try {
      await r2.putR2Object({ key: storagePath, body: cutBytes, contentType: "audio/mpeg" }, env);
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `mp3 upload failed: ${e.message}` });
      needsReview++;
      continue;
    }
    if (dualWrite) {
      try {
        await uploadSupabase(env, storagePath, cutBytes, "audio/mpeg");
      } catch (e) {
        console.warn(`WARN ${slug}: supabase mp3 dual-write failed: ${e.message}`);
      }
    }
    // 5. upload the trimmed timing manifest
    try {
      await r2.putR2Object(
        { key: timingsStoragePath, body: trimmedBuf, contentType: "application/json" },
        env,
      );
    } catch (e) {
      reviewLog.push({ slug, voice, reason: `timings upload failed: ${e.message}` });
      needsReview++;
      continue;
    }
    if (dualWrite) {
      try {
        await uploadSupabase(env, timingsStoragePath, trimmedBuf, "application/json");
      } catch (e) {
        console.warn(`WARN ${slug}: supabase timings dual-write failed: ${e.message}`);
      }
    }

    console.log(
      `CUT ${slug}: ${cut.cutSec}s drop ${dropped} source segs, mp3 ${originalBytes.length}->${cutBytes.length}B`,
    );
    truncated++;
  }

  console.log(
    `\nSUMMARY: truncated=${truncated} noSources=${noSources} needsReview=${needsReview} (of ${byKey.size} entries)`,
  );
  if (reviewLog.length) {
    const p = path.join(OUT_DIR, "review-log.json");
    fs.writeFileSync(p, JSON.stringify(reviewLog, null, 2));
    console.log(`needs-review log: ${p}`);
  }
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});