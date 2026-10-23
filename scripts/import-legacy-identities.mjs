#!/usr/bin/env node
/**
 * scripts/import-legacy-identities.mjs — finish the identity import started by
 * supabase/migrations/neon/005_identity_continuity.sql.
 *
 * WHY THIS IS A SCRIPT AND NOT SQL
 *   Migration 005 moves every stranded Supabase-era identity into
 *   neon_auth."user" with its ORIGINAL uuid, so roles / profiles /
 *   entitlements / subscriptions resolve again. What it cannot do is give an
 *   imported identity a Better Auth *credential* row, because Better Auth
 *   hashes passwords with scrypt (N=16384, r=16, p=1, dkLen=64, format
 *   `<saltHex>:<keyHex>`, password NFKC-normalised) and pgcrypto only offers
 *   bcrypt. Node's `node:crypto` does scrypt with exactly those parameters, so
 *   the hash format matches Better Auth byte for byte — no extra dependency,
 *   nothing to keep in sync.
 *
 * WHY A CREDENTIAL ROW AT ALL, WITH A PASSWORD NOBODY KNOWS
 *   The Supabase-era bcrypt hashes are not portable and the old project's auth
 *   schema is not reachable from here, so the original password cannot be
 *   carried over truthfully. Two honest options for the imported identity:
 *     (a) no credential row — then "forgot password" has no account for Better
 *         Auth to update, and the user has NO recovery path at all;
 *     (b) a credential row whose password is a random 48-byte secret that is
 *         generated here and immediately discarded — the password is
 *         unguessable and unknown to everyone (including this script), so
 *         sign-in returns the generic INVALID_EMAIL_OR_PASSWORD, and Better
 *         Auth's resetPassword has a row to update, which makes "forgot
 *         password" the real recovery path.
 *   This script does (b). It never prints or stores the random secret, and it
 *   never overwrites an existing credential row (a user who has already set a
 *   password keeps it).
 *
 * USAGE
 *   node scripts/import-legacy-identities.mjs            # apply + gate
 *   node scripts/import-legacy-identities.mjs --dry-run  # report only
 *
 * Exit 0 = every imported identity has a credential row AND
 *          public.assert_identity_continuity() passes.
 * Exit 1 = something is stranded (prints what).
 * Exit 2 = usage / environment error.
 *
 * RULES (do not relax)
 *   - Joins on `id` only. Never matches a legacy row to an auth account by
 *     email: that would hand a staff address's role and entitlements to
 *     whoever controls the address now.
 *   - Read-only against public.*; writes only neon_auth.account.
 */
import { randomBytes, scrypt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Better Auth / @better-auth/utils password parameters (verified against
 *  node_modules/@better-auth/utils/dist/password.node.mjs). */
const SCRYPT = { N: 16384, r: 16, p: 1, dkLen: 64 };
const MAXMEM = 128 * SCRYPT.N * SCRYPT.r * 2;

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function scryptKey(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT.dkLen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Unusable credential: hash of a random secret that is never persisted. */
async function unusablePasswordHash() {
  const secret = randomBytes(48).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const key = await scryptKey(secret, salt);
  return `${salt}:${key.toString("hex")}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const env = { ...loadEnv(), ...process.env };
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL(_UNPOOLED) is required");
    process.exit(2);
  }
  const sql = neon(url);
  const query = (text, params = []) => sql.query(text, params);

  // 1. Identities in the auth table that have no credential account yet.
  const pending = await query(`
    SELECT u.id::text              AS id,
           u.email                 AS email,
           (p.id IS NOT NULL)      AS mirrored
      FROM neon_auth."user" u
      LEFT JOIN public."user" p       ON p.id = u.id
      WHERE NOT EXISTS (
              SELECT 1 FROM neon_auth.account a
               WHERE a."userId" = u.id AND a."providerId" = 'credential'
            )
      ORDER BY u."createdAt"`);

  const stranded = await query(`
    SELECT count(*)::int AS n FROM public."user" p
     WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id = p.id)`);

  console.log(`identities without a credential account: ${pending.length}`);
  console.log(`public identities with no neon_auth row:  ${stranded[0].n}`);
  if (stranded[0].n > 0) {
    console.error(
      "\nApply supabase/migrations/neon/005_identity_continuity.sql first — " +
        "it imports the stranded identities by id.",
    );
    process.exit(1);
  }

  // 2. Add the unusable credential rows.
  let created = 0;
  for (const row of pending) {
    const hash = await unusablePasswordHash();
    if (dryRun) {
      console.log(`  would link credential account for ${row.email} (${row.id})`);
      continue;
    }
    const inserted = await query(
      `INSERT INTO neon_auth.account
         (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       SELECT gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, now(), now()
        WHERE NOT EXISTS (
                SELECT 1 FROM neon_auth.account a
                 WHERE a."userId" = $1::uuid AND a."providerId" = 'credential'
              )
       RETURNING id::text AS id`,
      [row.id, hash],
    );
    if (inserted.length > 0) {
      created += 1;
      console.log(`  linked credential account for ${row.email} (${row.id})`);
      if (!row.mirrored) {
        console.warn(`  WARNING: ${row.email} has no public."user" mirror`);
      }
    }
  }
  console.log(
    dryRun
      ? `dry run: ${pending.length} credential row(s) would be created`
      : `credential rows created: ${created}`,
  );

  if (dryRun) return;

  // 3. Gate: the same function cutover/CI calls. Raises on any orphan row.
  await query("SELECT public.assert_identity_continuity()");
  const report = await query("SELECT * FROM public.identity_continuity_report()");
  console.log("\nidentity continuity report (table/total/resolved/orphan):");
  for (const r of report) {
    console.log(
      `  ${String(r.check_name).padEnd(24)} ${String(r.total).padStart(4)} ` +
        `${String(r.resolves_to_auth).padStart(4)} ${String(r.not_resolved).padStart(4)}`,
    );
  }
  const withoutCredential = await query(`
    SELECT count(*)::int AS n FROM neon_auth."user" u
     WHERE NOT EXISTS (
             SELECT 1 FROM neon_auth.account a
              WHERE a."userId" = u.id AND a."providerId" = 'credential')
       AND NOT EXISTS (
             SELECT 1 FROM neon_auth.account a
              WHERE a."userId" = u.id AND a."providerId" <> 'credential')`);
  if (withoutCredential[0].n > 0) {
    console.error(
      `\n${withoutCredential[0].n} identity(ies) have no sign-in method at all`,
    );
    process.exit(1);
  }
  console.log("\nPASS — identity continuity holds, every identity can sign in.");
}

main().catch((err) => {
  console.error("import-legacy-identities failed:", err.message || err);
  process.exit(1);
});
