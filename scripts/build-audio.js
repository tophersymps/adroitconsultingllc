#!/usr/bin/env node
/**
 * scripts/build-audio.js — batch audio generator for the adroit blog.
 *
 * For each article (all, --recent N newest, or --slug one), it:
 *   1. reads content/blog/<slug>.mdx and computes the narration via the same
 *      pure function the tests use (src/lib/audio-narration.ts, imported
 *      through a small transpile shim — see _import.mjs).
 *   2. calls the configured TTS engine CLI to synthesize an mp3. The emitted
 *      MP3 is ALWAYS mono / 24000 Hz / 48kbps (the lean storage profile, see
 *      --bitrate): the private bucket must hold the whole narrated backfill
 *      inside the Supabase Free 1 GB storage tier (~5 MB/article at 48k vs
 *      ~13.3 MB at the old 128k, which at full catalogue does not fit).
 *   3. uploads it to the PRIVATE Cloudflare R2 bucket (adroit-audio, S3 API,
 *      bucket-scoped keys — src/lib/r2/client.ts putR2Object) at
 *      blog/<slug>/<voice>.mp3, and (while AUDIO_DUAL_WRITE_SUPABASE is not
 *      switched off) also to the private Supabase 'audio' bucket as the
 *      rollback leg. Every PUT is verified by re-reading R2.
 *   4. emits src/data/audio.ts (slug / voice / storagePath) — the static
 *      module the AudioPlayer + /api/audio route consume. NO public URL is
 *      ever emitted; storagePath is the private-bucket key only.
 *
 * The timing manifest (blog/<slug>/<voice>.timing.json) is written to the same
 * two stores with the MP3; the reader serves both from R2.
 *
 * Fails loudly on any missing dependency (no silent SKIP, no fabricated
 * upload): a missing engine, missing env, or failed upload aborts the run.
 *
 * SECURITY: no shell is ever spawned. Subprocesses use execFileSync with an
 * argv array, and `slug` (a content/blog FILENAME) / `voice` (CLI) are checked
 * against strict allowlists before they reach a path, a bucket key or an
 * argument — see assertSafeSlug/assertSafeVoice.
 *
 * INVARIANT: every run (incremental or not) MERGES. src/data/audio.ts is read
 * first and the union keyed by `slug`+`voice` is re-emitted, so an invocation
 * without --incremental/--backfill can never drop an existing entry or its
 * timingsStoragePath. Regenerating only updates the entries it re-synthesized.
 *
 * Usage:
 *   node scripts/build-audio.js --recent 5 --voice af_heart
 *   node scripts/build-audio.js --slug agent-eval-infrastructure-2026 --voice af_heart
 *   node scripts/build-audio.js --metadata-only --recent 5   # emit audio.ts without synth/upload
 *   node scripts/build-audio.js --backfill --voice af_heart  # idempotent: synth+upload ALL blog
 *                           # slugs missing from src/data/audio.ts and MERGE the result in
 *                           # (skips slugs already present with the target voice; use with
 *                           # --force to regenerate everything, --limit N to cap new synths).
 *                           # Used by the publish-time hook + nightly sweep automation.
 *
 * Write targets / rollback: R2 (adroit-audio) is the PRIMARY store — the
 * reader serves from it. The private Supabase 'audio' bucket is still written
 * as a DUAL WRITE while the transition window is open, so pointing the reader
 * back at Supabase remains a config change. Set AUDIO_DUAL_WRITE_SUPABASE=false
 * (or 0/no/off) in .env.local to drop the second upload. Nothing is ever
 * deleted from either bucket.
 *
 * Encoding: every generated MP3 is mono / 24000 Hz / 48kbps. --bitrate (or the
 * AUDIO_BITRATE env var) overrides the bitrate; do not raise the DEFAULT for a
 * backfill — a full-catalogue 128k backfill does not fit the Supabase Free 1 GB
 * tier.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(ROOT, "content", "blog");
const OUT_PATH = path.join(ROOT, "src", "data", "audio.ts");
const ENV_PATH = path.join(ROOT, ".env.local");
const DEFAULT_VOICE = process.env.AUDIO_VOICE || "af_heart";
/* Lean storage profile — see the header note. Passed through to the engine. */
const DEFAULT_BITRATE = process.env.AUDIO_BITRATE || "48k";
const BUCKET = "audio";

/*
 * Input validation (CWE-78 shell injection + path traversal).
 *
 * `slug` is a FILENAME from content/blog/*.mdx, `voice` and `bitrate` come from
 * the CLI (or an env var); all three are interpolated into filesystem paths,
 * storage keys and a subprocess argv. None is trusted: each must match a strict
 * allowlist before it is used anywhere. Without this, a file named
 * `evil$(touch PWNED)x.mdx` reached the TTS command (built as a shell string and
 * run through execSync, where "$(touch PWNED)" executed), `../` in a slug
 * escaped content/blog/ or .audio-out/, and `--bitrate '48k; touch PWNED #'`
 * was interpolated unquoted into that same shell string. Anything that does not
 * match aborts the run — a bad value is either an attack or a mistake that must
 * not be executed.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/; // matches every real blog slug (kebab-case)
const VOICE_RE = /^[a-z0-9][a-z0-9_-]*$/; // af_heart / bm_george use "_"
/*
 * ffmpeg's -b:a takes e.g. "48k"/"128k". The regex is the whole contract: it is
 * what keeps a value from --bitrate / AUDIO_BITRATE from ever reaching ffmpeg
 * as anything but a bitrate. Defence in depth — the value already travels as a
 * single argv element (no shell), so this is the second lock on the same door.
 */
const BITRATE_RE = /^\d{2,3}k$/;
function assertSafeSlug(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw new Error(
      `invalid slug ${JSON.stringify(slug)} rejected: must match ${SLUG_RE} (content/blog filename)`
    );
  }
}
function assertSafeVoice(v) {
  if (typeof v !== "string" || !VOICE_RE.test(v)) {
    throw new Error(`invalid voice ${JSON.stringify(v)} rejected: must match ${VOICE_RE}`);
  }
}
function assertSafeBitrate(b) {
  if (typeof b !== "string" || !BITRATE_RE.test(b)) {
    throw new Error(
      `invalid bitrate ${JSON.stringify(b)} rejected: must match ${BITRATE_RE} (e.g. "48k")`
    );
  }
}

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

/* --- parse frontmatter (mirrors build-posts.js) --- */
function parseFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0].trim() !== "---") return [null, raw];
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return [null, raw];
  const fm = {};
  for (const line of lines.slice(1, end)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    fm[line.slice(0, ci).trim()] = line.slice(ci + 1).trim().replace(/^["']|["']$/g, "");
  }
  return [fm, lines.slice(end + 1).join("\n")];
}

/* --- CLI args --- */
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const recentN = flag("--recent");
const slugOnly = flag("--slug");
const voice = flag("--voice") || DEFAULT_VOICE;
const bitrate = flag("--bitrate") || DEFAULT_BITRATE;
const metadataOnly = args.includes("--metadata-only");
const force = args.includes("--force");
const backfill = args.includes("--backfill");
const incremental = args.includes("--incremental") || backfill;
const limit = flag("--limit"); // cap new synths during a backfill run

if (metadataOnly && !recentN && !slugOnly && !backfill) {
  console.error("--metadata-only requires --recent N or --slug.");
  process.exit(2);
}

/* --- pencil article list --- */
function allSlugs() {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

/* date-desc sort for --recent (same as build-posts.js) */
function sortByDateDesc(slugs, fmCache) {
  return slugs.sort((a, b) => {
    const da = new Date((fmCache[a] || {}).date || 0);
    const db = new Date((fmCache[b] || {}).date || 0);
    return db - da;
  });
}

/* --- narration (shared pure function) --- */
async function loadNarration() {
  const { mdxToNarration } = await import(
    fileURLToPath(new URL("../src/lib/audio-narration.ts", import.meta.url))
  );
  return mdxToNarration;
}

/* --- emit src/data/audio.ts --- */
function emit(entries) {
  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  const lines = [
    "/**",
    " * GENERATED by scripts/build-audio.js — do not hand-edit.",
    " * Regenerate with: node scripts/build-audio.js --recent N --voice <v>",
    " * Contract types: src/lib/audio/contracts.ts.",
    " */",
    "import type { ArticleAudio } from \"@/lib/audio/contracts\";",
    "",
    "export const articleAudio: ArticleAudio[] = [",
  ];
  for (const e of entries) {
    lines.push(`  { slug: ${JSON.stringify(e.slug)}, voice: ${JSON.stringify(e.voice)}, storagePath: ${JSON.stringify(e.storagePath)}${e.timingsStoragePath ? `, timingsStoragePath: ${JSON.stringify(e.timingsStoragePath)}` : ""} },`);
  }
  lines.push("];", "");
  fs.writeFileSync(OUT_PATH, lines.join("\n"));
  console.log(`Wrote ${OUT_PATH}: ${entries.length} entries`);
}

/* Parse an existing src/data/audio.ts into {slug,voice,storagePath[,timingsStoragePath]}.
 * Used by --backfill/--incremental to MERGE rather than replace, so previously
 * generated articles (incl. any Tier C timingsStoragePath field) are preserved. */
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

/* --- storage writes: Cloudflare R2 (primary) + optional Supabase dual write ---
 *
 * The READ path (src/app/api/audio/[slug]/route.ts and its /timings twin)
 * serves objects out of the private R2 bucket, so the generator must WRITE
 * there or a freshly generated article is unreadable until someone mirrors it.
 *
 * Both writers go through src/lib/r2/client.ts (putR2Object) instead of
 * building an S3 client here: one place owns the endpoint, the four R2_* env
 * vars, and the rule that every PUT is verified by re-reading R2.
 *
 * ROLLBACK: the Supabase Storage objects are deliberately NOT deleted. While
 * AUDIO_DUAL_WRITE_SUPABASE is unset (default: ON, the transition window) each
 * object is also uploaded to the private Supabase `audio` bucket, so reverting
 * the reader to Supabase keeps working for objects generated during the
 * window. Set AUDIO_DUAL_WRITE_SUPABASE=false (or 0/no/off) in .env.local to
 * stop the extra uploads — no code change, no deploy.
 */
const R2_TYPE_STRIP_NODE_MAJOR = 22;
async function loadR2Client() {
  /* Node loads the .ts module by STRIPPING the types (default since Node 23.6;
   * this repo runs Node 26). Same mechanism the narration import above uses.
   * The suffix check turns a far-future "why is this a syntax error" into a
   * named failure. */
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < R2_TYPE_STRIP_NODE_MAJOR) {
    throw new Error(
      `node >= ${R2_TYPE_STRIP_NODE_MAJOR} is required to import src/lib/r2/client.ts (running ${process.versions.node})`
    );
  }
  return import(fileURLToPath(new URL("../src/lib/r2/client.ts", import.meta.url)));
}

/** True unless AUDIO_DUAL_WRITE_SUPABASE is explicitly switched off. */
function dualWriteSupabaseEnabled(env) {
  const raw = String(env.AUDIO_DUAL_WRITE_SUPABASE ?? "").trim();
  if (!raw) return true; // unset == the transition window, dual write ON
  return !/^(0|false|no|off)$/i.test(raw);
}

/**
 * Supabase Storage upload (REST, service-role). Kept ONLY as the rollback
 * dual-write leg — R2 is the store the reader serves from.
 */
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

/**
 * Write one object (an MP3 or a timing manifest) to R2, verifying the stored
 * size, then optionally to Supabase Storage. Returns the verified R2 size.
 * Any failure throws — the caller aborts the run (no partial, silent success).
 */
async function writeObject({ env, storagePath, buf, dualWrite }) {
  const r2 = await getR2();
  const head = await r2.putR2Object(
    {
      key: storagePath,
      body: buf,
      contentType: r2.contentTypeForKey(storagePath),
    },
    env
  );
  console.log(`OK ${storagePath} r2://${env.R2_BUCKET}/${storagePath} ${head.size} bytes (verified)`);
  if (dualWrite) {
    await uploadSupabase(env, storagePath, buf, r2.contentTypeForKey(storagePath));
    console.log(`OK ${storagePath} supabase://${BUCKET}/${storagePath} ${buf.byteLength} bytes (dual write)`);
  }
  return head.size;
}

/** @returns the R2_* vars that are absent from `env`. */
function missingR2Env(env) {
  return ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(
    (k) => !env[k]
  );
}

let r2Module = null;

/**
 * Load (once) the shared R2 client module. Deferred to the first WRITE on
 * purpose: a run that never uploads — `--metadata-only`, or one that aborts on
 * a bad slug / failed TTS — needs no R2 env and no aws-sdk, exactly as it did
 * before the write path moved. Completeness of the R2 env is reported at
 * startup and enforced by the upload itself (putR2Object throws).
 */
async function getR2() {
  if (!r2Module) r2Module = await loadR2Client();
  return r2Module;
}

async function main() {
  /* voice/bitrate come from --voice|--bitrate (or the AUDIO_VOICE|AUDIO_BITRATE
   * env vars) and land in storage keys + argv. Both are validated before use. */
  assertSafeVoice(voice);
  assertSafeBitrate(bitrate);
  const env = loadEnv();
  const dualWrite = dualWriteSupabaseEnabled(env);
  if (!metadataOnly) {
    console.log(
      `write targets: r2${env.R2_BUCKET ? `:${env.R2_BUCKET}` : ""} (primary)${
        dualWrite ? " + supabase:audio (dual write)" : " — supabase dual write OFF"
      }`
    );
    const missing = missingR2Env(env);
    if (missing.length) {
      console.warn(
        `WARNING: R2 configuration is incomplete: missing ${missing.join(", ")} — the first upload will fail. Add them to .env.local.`
      );
    }
  }
  const mdxToNarration = await loadNarration();

  let slugs = allSlugs();
  const fmCache = {};
  for (const s of slugs) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, `${s}.mdx`), "utf-8");
    const [fm] = parseFrontmatter(raw);
    fmCache[s] = fm || {};
  }
  if (slugOnly) slugs = slugOnly.split(",").map((s) => s.trim());
  if (recentN) slugs = sortByDateDesc(slugs, fmCache).slice(0, parseInt(recentN, 10));
  if (backfill && !slugOnly) slugs = allSlugs(); // --backfill alone targets every blog article

  /*
   * NEVER lose state. The union is seeded from whatever src/data/audio.ts
   * already holds on EVERY path — not just the incremental ones. A run without
   * --incremental/--backfill (the documented `--recent N` / `--slug X` usage)
   * used to start from `[]` and re-emit the module from scratch, silently
   * dropping every entry it did not re-synthesize — including their
   * timingsStoragePath — and the audio-backfill cron committed that loss
   * straight to main (2 clobbers + a ~1.5h broken-main build outage,
   * 2026-09-15). Entries are merged keyed by `slug`/`voice`; emit format is
   * unchanged.
   */
  const entries = readExistingEntries();
  const byKey = new Map(entries.map((e) => [`${e.slug}/${e.voice}`, e]));
  const existingKey = new Set(byKey.keys());
  const limitN = limit ? parseInt(limit, 10) : null;
  let synthesized = 0;

  /*
   * Merge one entry into the union (never replace wholesale). A field already
   * on disk is only overwritten when this run actually produced a replacement,
   * so a run that does not regenerate the timing manifest (e.g. --metadata-only)
   * can never downgrade an entry by dropping its timingsStoragePath.
   */
  function putEntry(entry) {
    const key = `${entry.slug}/${entry.voice}`;
    const prev = byKey.get(key);
    const merged = { ...prev, ...entry };
    if (!merged.timingsStoragePath && prev && prev.timingsStoragePath) {
      merged.timingsStoragePath = prev.timingsStoragePath;
    }
    byKey.set(key, merged);
  }

  for (const slug of slugs) {
    /* Reject a hostile/malformed slug BEFORE it reaches path.join, a storage
     * key, or a subprocess argv: this is the boundary that closes both the
     * shell-injection and the `../` path-traversal variants. */
    assertSafeSlug(slug);
    if (incremental && !force && existingKey.has(`${slug}/${voice}`)) {
      console.log(`SKIP ${slug}: ${voice} already in audio.ts`);
      continue;
    }
    if (limitN !== null && synthesized >= limitN) {
      console.log(`STOP ${slug}: reached --limit ${limitN}`);
      break;
    }
    const raw = fs.readFileSync(path.join(BLOG_DIR, `${slug}.mdx`), "utf-8");
    const narration = mdxToNarration(raw);
    const storagePath = `blog/${slug}/${voice}.mp3`;
    if (!narration.trim()) {
      console.error(`ERROR ${slug}: empty narration`);
      process.exit(1);
    }
    if (metadataOnly) {
      putEntry({ slug, voice, storagePath });
      continue;
    }

    // synthesize via the TTS engine CLI.
    // NO SHELL: execFileSync + an argv array keeps every value a single
    // argument, so a path can never be re-interpreted as shell syntax
    // ($(...), backticks, ${...}, ;). Narration is passed as one argv element,
    // which preserves REAL newlines natively — the old `"$(cat <file>)"`
    // substitution only existed to get real newlines through a shell string
    // (the even older JSON.stringify(narration) turned them into literal
    // backslash-n chars Kokoro read aloud as "backslash n"). The temp
    // .narration.txt file is therefore gone as well.
    // The lean bitrate travels as its own argv element on the same call — the
    // value is allowlisted by assertSafeBitrate() before main() does any work.
    const out = path.join(ROOT, ".audio-out", `${slug}.mp3`);
    const timingPath = path.join(ROOT, ".audio-out", `${slug}.timing.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const engine = path.join(ROOT, "scripts", "tts", "engines", "engine_kokoro.py");
    const venvPython = path.join(ROOT, "scripts", "tts", ".venv", "bin", "python");
    try {
      execFileSync(
        venvPython,
        [engine, "--text", narration, "--voice", voice, "--bitrate", bitrate, "--out", out, "--timing", timingPath],
        { timeout: 120000, encoding: "utf-8" }
      );
    } catch (e) {
      console.error(`ERROR ${slug}: TTS failed (${String(e.message).slice(0, 400)})`);
      process.exit(1);
    }
    // verify the file is real audio (marshal via `file`)
    let finfo = "";
    try {
      finfo = execFileSync("file", ["-b", out], { encoding: "utf-8" }).trim();
    } catch {
      finfo = "";
    }
    if (!/audio|mpeg|wave|WAVE/i.test(finfo)) {
      console.error(`ERROR ${slug}: produced file is not audio (${finfo || "unknown"})`);
      process.exit(1);
    }
    const mp3Buf = fs.readFileSync(out);

    try {
      await writeObject({ env, storagePath, buf: mp3Buf, dualWrite });
    } catch (e) {
      console.error(`ERROR ${slug}: upload of ${storagePath} failed (${String(e.message).slice(0, 400)})`);
      process.exit(1);
    }
    const size = fs.statSync(out).size;
    console.log(`OK ${slug} ${voice} ${bitrate} ${size} bytes -> ${storagePath}`);

    // Tier C exact paragraph scroll-sync: upload the per-segment timing
    // manifest (emitted by engine_kokoro.py --timing) to the private bucket
    // and record its key on the entry so the authed /api/audio/<slug>/timings
    // route can serve it. A timing file is REQUIRED for a real generation:
    // if the engine did not produce one, abort (do not emit an entry whose
    // Follow-along would silently be wrong).
    const timingStoragePath = `blog/${slug}/${voice}.timing.json`;
    if (!fs.existsSync(timingPath)) {
      console.error(`ERROR ${slug}: engine did not emit ${timingPath} (--timing missing?)`);
      process.exit(1);
    }
    const timingsBuf = fs.readFileSync(timingPath);
    JSON.parse(timingsBuf.toString("utf-8")); // fail loudly on malformed manifest
    try {
      await writeObject({ env, storagePath: timingStoragePath, buf: timingsBuf, dualWrite });
    } catch (e) {
      console.error(
        `ERROR ${slug}: upload of ${timingStoragePath} failed (${String(e.message).slice(0, 400)})`
      );
      process.exit(1);
    }
    console.log(`OK ${slug} timings ${timingsBuf.length} bytes -> ${timingStoragePath}`);

    putEntry({ slug, voice, storagePath, timingsStoragePath: timingStoragePath });
    synthesized++;
  }

  emit([...byKey.values()]);
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});