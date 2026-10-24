#!/usr/bin/env node
/**
 * compose-changelog.js - merge changelog.d/*.md fragments into CHANGELOG.md.
 *
 * WHY THIS EXISTS
 * ---------------
 * CHANGELOG.md used to be edited by every branch. Every branch therefore
 * appended to the same lines at the top of the same file, so every branch
 * conflicted with every other branch as soon as main moved. On 2026-10-23 that
 * produced 50 resolution merges in a single day and one resolution silently
 * deleted a release body (PR #361 dropped the R1-6 provisioning section, which
 * PR #367 had to restore).
 *
 * A fragment has a unique path, so it cannot conflict. This script is the only
 * thing that writes to CHANGELOG.md.
 *
 * USAGE
 *   node scripts/compose-changelog.js            # merge fragments, move them to .shipped/
 *   node scripts/compose-changelog.js --dry-run  # report what would be merged
 *
 * SAFETY
 *   - Idempotent: consumed fragments move to changelog.d/.shipped/ and are never
 *     re-applied.
 *   - The header above the first `###` entry is preserved byte for byte.
 *   - Fragments are inserted newest-first by filename, then verified to start
 *     with a `###` heading; anything else is rejected rather than silently
 *     corrupting the file.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const FRAG_DIR = path.join(ROOT, "changelog.d");
const SHIPPED_DIR = path.join(FRAG_DIR, ".shipped");
const HEADER_END =
  "All notable changes to the Adroit Consulting Blog project will be documented in this file.";

const dryRun = process.argv.includes("--dry-run");

function main() {
  if (!fs.existsSync(FRAG_DIR)) {
    console.log("[changelog] no changelog.d/ directory; nothing to do");
    return;
  }

  const fragments = fs
    .readdirSync(FRAG_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();

  if (fragments.length === 0) {
    console.log("[changelog] no fragments to compose");
    return;
  }

  const bodies = [];
  for (const name of fragments) {
    const p = path.join(FRAG_DIR, name);
    const raw = fs.readFileSync(p, "utf8").trim();
    if (!raw.startsWith("###")) {
      throw new Error(
        `[changelog] ${name} does not start with a "###" heading; refusing to compose`
      );
    }
    bodies.push({ name, raw });
  }

  const current = fs.readFileSync(CHANGELOG, "utf8");
  const headerIdx = current.indexOf(HEADER_END);
  if (headerIdx === -1) {
    throw new Error(
      "[changelog] could not find the changelog header line; refusing to compose"
    );
  }
  const splitAt = headerIdx + HEADER_END.length;
  const header = current.slice(0, splitAt);
  const rest = current.slice(splitAt);

  const addition = bodies.map((b) => `${b.raw}\n\n`).join("");
  const next = `${header}\n\n${addition}${rest.replace(/^\n+/, "")}`;

  console.log(`[changelog] composing ${bodies.length} fragment(s):`);
  for (const b of bodies) console.log(`  - ${b.name}`);

  if (dryRun) {
    console.log("[changelog] --dry-run: CHANGELOG.md not written, fragments not moved");
    return;
  }

  fs.writeFileSync(CHANGELOG, next);
  fs.mkdirSync(SHIPPED_DIR, { recursive: true });
  for (const b of bodies) {
    fs.renameSync(path.join(FRAG_DIR, b.name), path.join(SHIPPED_DIR, b.name));
  }
  console.log(`[changelog] wrote CHANGELOG.md and moved ${bodies.length} fragment(s) to .shipped/`);
}

main();
