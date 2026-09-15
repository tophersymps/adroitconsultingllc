#!/usr/bin/env node
/**
 * One-shot content path rewrite for the Adroit URL migration (Part E).
 *
 * Rewrites internal content links after the route rename (Task 1, ddec282):
 *   /blog/<slug>  ->  /field-notes/<slug>
 *   /learn/<...>  ->  /atlas/<...>
 * and repoints stale absolute citations from the old private deploy:
 *   https://adroit-blog-two.vercel.app/blog/...  ->  https://adroit.io/field-notes/...
 *   https://adroit-blog-two.vercel.app/learn/... ->  https://adroit.io/atlas/...
 *
 * EXTERNAL /blog/ and /learn/ URLs (salesforce.com, trailhead.salesforce.com,
 * nextjs.org, sei.cmu.edu, etc.) are deliberately NOT matched: they carry a
 * full host prefix, so the targeted `](/blog/`, `](/learn/`, and
 * `adroit-blog-two.vercel.app/(blog|learn)/` patterns cannot hit them.
 *
 * Usage:
 *   node scripts/rewrite-content-paths.js            # dry-run (no writes)
 *   node scripts/rewrite-content-paths.js --apply    # write changes in place
 *
 * Dry-run prints a per-file summary and writes the full unified diff to
 * content-rewrite.diff (git-style, with -/+ lines for human review).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const APPLY = process.argv.includes("--apply");

// Precise replacements. Order matters: absolute-host forms first so the
// relative forms below cannot double-apply to the vercel URLs.
const REPLACEMENTS = [
  ["https://adroit-blog-two.vercel.app/learn/", "https://adroit.io/atlas/"],
  ["https://adroit-blog-two.vercel.app/blog/", "https://adroit.io/field-notes/"],
  ["[adroit-blog-two.vercel.app]", "[adroit.io]"],
  ["](/learn/", "](/atlas/"],
  ["](/blog/", "](/field-notes/"],
];

function collectFiles() {
  const files = [];
  for (const mdx of fs.readdirSync(path.join(CONTENT, "blog"))) {
    if (mdx.endsWith(".mdx")) files.push(path.join(CONTENT, "blog", mdx));
  }
  const learnRoot = path.join(CONTENT, "learn");
  for (const series of fs.readdirSync(learnRoot)) {
    const sDir = path.join(learnRoot, series);
    if (!fs.statSync(sDir).isDirectory()) continue;
    for (const mdx of fs.readdirSync(sDir)) {
      if (mdx.endsWith(".mdx")) files.push(path.join(sDir, mdx));
    }
  }
  return files;
}

function rewrite(text) {
  for (const [from, to] of REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  return text;
}

function diffLines(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const max = Math.max(oldLines.length, newLines.length);
  const out = [];
  for (let i = 0; i < max; i++) {
    const a = oldLines[i];
    const b = newLines[i];
    if (a === b) continue;
    if (a !== undefined) out.push(`-${a}`);
    if (b !== undefined) out.push(`+${b}`);
  }
  return out;
}

const files = collectFiles();
const perFile = [];
const allDiff = [];
let totalReplacements = 0;

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const updated = rewrite(original);
  if (original === updated) continue;
  const count = REPLACEMENTS.reduce(
    (n, [from]) => n + (original.split(from).length - 1),
    0
  );
  totalReplacements += count;
  perFile.push({ file, count });
  const rel = path.relative(ROOT, file);
  allDiff.push(`--- a/${rel}`);
  allDiff.push(`+++ b/${rel}`);
  allDiff.push(...diffLines(original, updated));
}

if (!APPLY) {
  console.log(`DRY-RUN: ${perFile.length} files would change, ${totalReplacements} replacements.\n`);
  for (const { file, count } of perFile) {
    console.log(`  ${path.relative(ROOT, file)}  (${count})`);
  }
  if (allDiff.length) {
    const diffPath = path.join(ROOT, "content-rewrite.diff");
    fs.writeFileSync(diffPath, allDiff.join("\n") + "\n");
    console.log(`\nFull diff written to ${diffPath} (${allDiff.length} lines). Review it, then re-run with --apply.`);
  }
  process.exit(0);
}

let applied = 0;
for (const { file, count } of perFile) {
  const original = fs.readFileSync(file, "utf8");
  const updated = rewrite(original);
  fs.writeFileSync(file, updated);
  applied += count;
}
console.log(`APPLIED: ${perFile.length} files rewritten, ${applied} replacements.`);
