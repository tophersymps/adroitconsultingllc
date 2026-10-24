#!/usr/bin/env node
/**
 * scripts/qa-create-test-user.cjs — the ONLY sanctioned way to create a throwaway
 * test identity on adroit.io, post the 2026-10-23 Supabase → Neon cutover.
 *
 * WHY THIS EXISTS
 * ---------------
 * A public signup always sends a verification email. When the address has no
 * mailbox (e.g. `steel.tiec.verify@adroit.io`) that send is a hard bounce, and on a
 * low-volume sender a couple of bounces is a double-digit bounce rate — which is what
 * triggered Supabase's "restrict your email sending privileges" warning on 2026-09-15.
 * The old GoTrue Admin API existed to create an account already-confirmed while
 * sending nothing.
 *
 * WHAT REPLACED IT
 * ----------------
 * GoTrue and the Supabase project are gone; auth is Neon Managed Better Auth
 * (`POST {NEON_AUTH_BASE_URL}/sign-up/email`, identities in `neon_auth."user"` and
 * `neon_auth.account`). There is no admin-create endpoint that accepts a usable
 * password, because the hash is produced inside the auth service. So this script:
 *
 *   1. signs the identity up through the auth service — ONE verification email, sent
 *      to a REAL inbox (never a client-domain address, so it cannot bounce),
 *   2. marks it verified over DATABASE_URL so a check never depends on
 *      `requireEmailVerification` staying `false`,
 *   3. asserts the eager trigger mirrored it into `public."user"` (the FK target for
 *      every progress table — `supabase/migrations/neon/002_provision_public_user.sql`),
 *   4. proves the issued credentials work by signing in before printing them.
 *
 * USAGE
 * -----
 *   node scripts/qa-create-test-user.cjs <label>            # create or reuse
 *   node scripts/qa-create-test-user.cjs <label> --delete   # delete after the check
 *
 * Prints JSON: { email, password, id, created, verified, public_user_rows, sign_in,
 * emails_sent }. Sign in through the real UI with those credentials.
 *
 * RULES (do not relax)
 * --------------------
 *   - `label` becomes the plus-tag: `kelex1812+qa-<label>@gmail.com`, which delivers to
 *     a REAL inbox. Never invent an address at the client's own domain.
 *   - Never call a recover/resend endpoint from a test/verification script.
 *   - Delete the account when the verification is done (`--delete`).
 *   - Requires NEON_AUTH_BASE_URL + DATABASE_URL(_UNPOOLED) in .env.local.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BASE = process.env.QA_TEST_EMAIL_BASE || "kelex1812@gmail.com";

function loadEnv() {
  const env = {};
  const p = path.join(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function plusTagged(base, label) {
  const [user, domain] = base.split("@");
  return `${user.split("+")[0]}+qa-${label}@${domain}`;
}

/** Emails derive from a validated label + a fixed base, so single-quote escaping suffices. */
function lit(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sql(env, statement) {
  const dsn = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  return execFileSync("psql", [dsn, "-X", "-q", "-A", "-t", "-c", statement], {
    encoding: "utf-8",
  }).trim();
}

/**
 * Managed Better Auth rejects an origin-less request ("MISSING_ORIGIN"), so the call
 * must present a trusted origin. adroit.io is in `neon_auth.project_config
 * .trusted_origins` (with www.adroit.io and https://*.vercel.app); localhost is NOT
 * (allow_localhost = false), which is why localhost must not be used here.
 */
const AUTH_ORIGIN = process.env.QA_AUTH_ORIGIN || "https://adroit.io";

async function authPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: AUTH_ORIGIN },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  const label = (process.argv[2] || "").trim();
  const del = process.argv.includes("--delete");
  if (!/^[a-z0-9-]{2,32}$/.test(label)) {
    console.error("usage: node scripts/qa-create-test-user.cjs <label(a-z0-9-)> [--delete]");
    process.exit(2);
  }

  const env = loadEnv();
  const authBase = (env.NEON_AUTH_BASE_URL || "").replace(/\/+$/, "");
  const dsn = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!authBase || !dsn) {
    console.error("NEON_AUTH_BASE_URL and DATABASE_URL(_UNPOOLED) are required in .env.local");
    process.exit(2);
  }

  const email = plusTagged(BASE, label);
  const count = (out) => (out ? out.split("\n").filter(Boolean).length : 0);

  if (del) {
    const nsession = sql(env, `DELETE FROM neon_auth.session WHERE "userId" IN (SELECT id FROM neon_auth."user" WHERE email = ${lit(email)}) RETURNING 1;`);
    const naccount = sql(env, `DELETE FROM neon_auth.account WHERE "userId" IN (SELECT id FROM neon_auth."user" WHERE email = ${lit(email)}) RETURNING 1;`);
    const npublic = sql(env, `DELETE FROM public."user" WHERE email = ${lit(email)} RETURNING 1;`);
    const nuser = sql(env, `DELETE FROM neon_auth."user" WHERE email = ${lit(email)} RETURNING 1;`);
    console.log(
      JSON.stringify({
        email,
        deleted: count(nuser) > 0,
        rows: {
          auth_user: count(nuser),
          account: count(naccount),
          session: count(nsession),
          public_user: count(npublic),
        },
      }),
    );
    return;
  }

  const password = `Qa-${label}-2026!`;
  let id = sql(env, `SELECT id FROM neon_auth."user" WHERE email = ${lit(email)} ORDER BY "createdAt" LIMIT 1;`);
  let created = false;
  let emailsSent = 0;

  if (!id) {
    const r = await authPost(`${authBase}/sign-up/email`, {
      email,
      password,
      name: `QA ${label}`,
    });
    if (!r.ok) {
      console.error(JSON.stringify({ error: r.json || r.text.slice(0, 300), status: r.status }));
      process.exit(1);
    }
    created = true;
    emailsSent = 1; // the verification mail — to a real inbox by construction
    id =
      (r.json && r.json.user && r.json.user.id) ||
      sql(env, `SELECT id FROM neon_auth."user" WHERE email = ${lit(email)} ORDER BY "createdAt" DESC LIMIT 1;`);
  }

  if (!id) {
    console.error(JSON.stringify({ error: "no user id after sign-up", email }));
    process.exit(1);
  }

  // Deterministic verified state — never depend on requireEmailVerification being false.
  sql(env, `UPDATE neon_auth."user" SET "emailVerified" = true, "updatedAt" = now() WHERE id = ${lit(id)};`);
  // The eager trigger owns this mirror; assert it instead of assuming it.
  const provisioned = sql(env, `SELECT count(*) FROM public."user" WHERE id = ${lit(id)};`);

  // Prove the credentials the caller is about to paste actually work.
  const signIn = await authPost(`${authBase}/sign-in/email`, { email, password });
  if (!signIn.ok) {
    console.error(
      JSON.stringify({
        error: "sign-in with the issued credentials failed",
        status: signIn.status,
        detail: signIn.json || signIn.text.slice(0, 300),
        email,
        id,
      }),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      email,
      password,
      id,
      created,
      verified: true,
      public_user_rows: Number(provisioned || 0),
      sign_in: "ok",
      emails_sent: emailsSent,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e) }));
  process.exit(1);
});
