#!/usr/bin/env node
/**
 * scripts/qa-create-test-user.cjs — the ONLY sanctioned way to create a throwaway
 * test identity on the adroit.io Supabase project.
 *
 * WHY THIS EXISTS
 * ---------------
 * `POST /auth/v1/signup` with an unverified address on a project that has
 * `enable_confirmations: true` ALWAYS sends a confirmation email. When the
 * address has no mailbox (e.g. `steel.tiec.verify@adroit.io`) that send is a
 * hard bounce, and on a low-volume project a couple of bounces is a
 * double-digit bounce rate — which is what triggered Supabase's
 * "restrict your email sending privileges" warning on 2026-09-15.
 *
 * The GoTrue Admin API (`POST /auth/v1/admin/users` + `email_confirm: true`)
 * creates the account already-confirmed and sends NOTHING.
 *
 * USAGE
 * -----
 *   node scripts/qa-create-test-user.cjs <label>            # create (or reuse contirmed)
 *   node scripts/qa-create-test-user.cjs <label> --delete   # delete after the check
 *
 * Prints JSON: { email, password, id, created } — sign in through the real UI
 * with those credentials.
 *
 * RULES (do not relax)
 * --------------------
 *   - `label` becomes the plus-tag: `kelex1812+qa-<label>@gmail.com`, which
 *     delivers to a REAL inbox. Never invent an address at the client's own
 *     domain unless that mailbox actually exists.
 *   - Never call `/auth/v1/signup`, `/auth/v1/recover` or `/auth/v1/resend`
 *     from a test/verification script against a client project.
 *   - Delete the account when the verification is done (`--delete`).
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.QA_TEST_EMAIL_BASE || "kelex1812@gmail.com";

function loadEnv() {
  const env = {};
  const p = path.join(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function plusTagged(base, label) {
  const [user, domain] = base.split("@");
  return `${user.split("+")[0]}+qa-${label}@${domain}`;
}

async function main() {
  const label = (process.argv[2] || "").trim();
  const del = process.argv.includes("--delete");
  if (!/^[a-z0-9-]{2,32}$/.test(label)) {
    console.error("usage: node scripts/qa-create-test-user.cjs <label(a-z0-9-)> [--delete]");
    process.exit(2);
  }
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
    process.exit(2);
  }
  const auth = { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" };
  const email = plusTagged(BASE, label);

  const list = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: auth });
  const found = ((await list.json()).users || []).find((u) => u.email === email);

  if (del) {
    if (!found) {
      console.log(JSON.stringify({ email, deleted: false, reason: "not found" }));
      return;
    }
    const r = await fetch(`${url}/auth/v1/admin/users/${found.id}`, { method: "DELETE", headers: auth });
    console.log(JSON.stringify({ email, id: found.id, deleted: r.ok, status: r.status }));
    return;
  }

  const password = `Qa-${label}-2026!`;
  // Admin create: sends no email. RULE: never use /auth/v1/signup here.
  const created = found
    ? await fetch(`${url}/auth/v1/admin/users/${found.id}`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ password, email_confirm: true }),
      })
    : await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
  const body = await created.json().catch(() => ({}));
  if (!created.ok) {
    console.error(JSON.stringify({ error: body, status: created.status }));
    process.exit(1);
  }
  const id = body.id || (found && found.id);
  if (!id) {
    console.error(JSON.stringify({ error: "no user id returned", body }));
    process.exit(1);
  }
  // Guarantee confirmation even on the reuse path.
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ email_confirm: true }),
  });
  console.log(JSON.stringify({ email, password, id, created: !found, emails_sent: 0 }));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e) }));
  process.exit(1);
});
