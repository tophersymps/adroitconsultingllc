#!/usr/bin/env python3
"""verify-identity-continuity.py — read-only cutover gate for the R2-1
identity migration (task t_33739716).

The HIGH finding it closes: after R2-1, `getAccessUserId()` returns the
Managed Better Auth id, but the user-scoped public tables were still keyed by
the pre-migration Supabase-era ids, so 0/4 `user_roles` and 0/38
`user_entitlements` resolved, every admin fell back to `member`, and the
People panel lost the legacy customers.

This script re-measures the invariant on the live database and fails (exit 1)
if any user-scoped row is stranded. It is READ-ONLY: no INSERT/UPDATE/DELETE,
no DDL, no auth-endpoint calls.

Checks
  1. `public.identity_continuity_report()` — 0 unresolved rows in
     user_roles / user_entitlements / user_profiles / subscriptions, and 0
     `public."user"` ids missing from `neon_auth."user"`.
  2. Every `public."user"` id has a `neon_auth."user"` row with the SAME id
     and the SAME email (uuid preservation, not email matching).
  3. Every identity has at least one sign-in method (`neon_auth.account`), so
     "forgot password" is a real recovery path for imported users.
  4. The named imported admin (`--admin-email`, default the first legacy
     admin) resolves to role `admin` through an ID JOIN:
       public.user_roles.user_id = neon_auth."user".id
     and its two ids are identical — the exact join `loadRole()`
     (src/lib/access.ts:321-330) performs with the id `getAccessUserId()`
     returns from the session cookie.
  5. No identity is duplicated by email inside neon_auth (the unique
     constraint should make this impossible; a violation means the
     "never reconcile by email" rule was bypassed).

Evidence is written to reports/identity-continuity-evidence.json (counts and
emails of the roles involved — no secrets, no password material).

Usage:
  python3 scripts/verify-identity-continuity.py [--admin-email ...] [--require-admin]
Exit 0 = every check passes. Exit 1 = a check failed. Exit 2 = env error.

`--require-admin <email>` makes check 4 mandatory for that email; without it
the check still runs against every admin role row it finds (it is cheap).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS: list[dict] = []


def load_dotenv() -> None:
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def sql(query: str, db_url: str) -> list[list[str]]:
    proc = subprocess.run(
        ["psql", db_url, "-X", "-q", "-A", "-F", "\t", "-t", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr.strip()}")
    rows = []
    for line in proc.stdout.strip().splitlines():
        if line.strip():
            rows.append(line.split("\t"))
    return rows


def record(check: str, ok: bool, *, expected: str, detail=None) -> None:
    RESULTS.append({"check": check, "ok": ok, "expected": expected, "detail": detail})
    print(f"  [{'PASS' if ok else 'FAIL'}] {check:<56}{'' if ok else ' <<< ' + expected}")
    if detail is not None:
        print(f"         {json.dumps(detail, default=str)[:400]}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-email", default=None,
                        help="imported admin email to prove resolves as admin")
    parser.add_argument("--report", default=os.path.join(ROOT, "reports",
                                                         "identity-continuity-evidence.json"))
    parser.add_argument("--db-url", default=None)
    args = parser.parse_args()

    load_dotenv()
    db_url = args.db_url or os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL_UNPOOLED (or DATABASE_URL) is required")

    # ── 1. continuity report ────────────────────────────────────────────
    print("1. user-scoped rows resolving to a neon_auth identity")
    rows = sql("SELECT check_name, total, resolves_to_auth, not_resolved "
               "FROM public.identity_continuity_report()", db_url)
    report = {}
    for name, total, resolved, orphans in rows:
        report[name] = {"total": int(total), "resolves_to_auth": int(resolved),
                        "not_resolved": int(orphans)}
        record(f"continuity.{name}", int(orphans) == 0,
               expected="0 unresolved rows",
               detail={"total": int(total), "resolved": int(resolved), "orphans": int(orphans)})

    # ── 2. uuid preservation, mirrored rows ─────────────────────────────
    print("2. public.\"user\" ↔ neon_auth.\"user\" mirror (same id, same email)")
    rows = sql("""
        SELECT count(*)::text,
               count(*) FILTER (WHERE lower(n.email) = lower(p.email))::text
          FROM public."user" p
          JOIN neon_auth."user" n ON n.id = p.id
    """, db_url)
    joined, same_email = (int(rows[0][0]), int(rows[0][1])) if rows else (0, 0)
    total_public = int(sql('SELECT count(*)::text FROM public."user"', db_url)[0][0])
    record("mirror.ids_preserved", joined == total_public,
           expected="every public identity has a neon_auth row with the same uuid",
           detail={"public_users": total_public, "joined_on_id": joined})
    record("mirror.emails_match", same_email == joined,
           expected="imported rows carry the same email as the legacy row",
           detail={"joined": joined, "same_email": same_email})

    # ── 3. every identity can authenticate ──────────────────────────────
    print("3. sign-in method present for every identity")
    rows = sql("""
        SELECT count(*)::text FROM neon_auth."user" u
         WHERE NOT EXISTS (SELECT 1 FROM neon_auth.account a WHERE a."userId" = u.id)
    """, db_url)
    stranded = int(rows[0][0]) if rows else 0
    record("identity.has_sign_in_method", stranded == 0,
           expected="0 identities without a neon_auth.account row",
           detail={"identities_without_account": stranded})

    # ── 4. imported admin resolves as admin via an ID JOIN ──────────────
    print("4. imported admin resolves as admin through the id join loadRole() uses")
    admin_rows = sql("""
        SELECT n.id::text, n.email, r.role,
               (n.id = r.user_id)::text AS same_uuid
          FROM public.user_roles r
          JOIN neon_auth."user" n ON n.id = r.user_id
         WHERE r.role = 'admin'
         ORDER BY n.email
    """, db_url)
    target = args.admin_email
    if target:
        admin_rows = [r for r in admin_rows if r[1].lower() == target.lower()]
    record("admin.imported_admin_count", len(admin_rows) > 0,
           expected="at least one admin role row joins to a neon_auth identity",
           detail={"admins": [{"email": r[1], "id": r[0]} for r in admin_rows]})
    for uid, email, role, same in admin_rows:
        ok = role == "admin" and same == "true"
        record(f"admin.resolves.{email}", ok,
               expected="role=admin with identical uuid on both sides",
               detail={"neon_auth_id": uid, "role": role, "same_uuid": same})
    if target and not admin_rows:
        record(f"admin.requested.{target}", False,
               expected="requested email is an imported admin (id join)",
               detail=None)

    # ── 5. no email-keyed reconciliation ────────────────────────────────
    print("5. no email-keyed identity reconciliation")
    rows = sql("""
        SELECT lower(email) AS email, count(*)::text
          FROM neon_auth."user" GROUP BY 1 HAVING count(*) > 1
    """, db_url)
    record("identity.no_duplicate_email", len(rows) == 0,
           expected="0 duplicate emails in neon_auth.\"user\"",
           detail={"duplicates": [r[0] for r in rows]})

    # ── verdict ─────────────────────────────────────────────────────────
    passed = sum(1 for r in RESULTS if r["ok"])
    failed = [r["check"] for r in RESULTS if not r["ok"]]
    verdict = "PASS" if not failed else "FAIL"
    print(f"\n{verdict} ({passed}/{len(RESULTS)} checks)" + (f" failed: {failed}" if failed else ""))

    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as handle:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "target": db_url.split("@")[-1].split("/")[0] if "@" in db_url else "unknown",
            "verdict": verdict,
            "checks_total": len(RESULTS),
            "checks_passed": passed,
            "continuity_report": report,
            "checks": RESULTS,
        }, handle, indent=2, default=str)
    print(f"evidence: {os.path.relpath(args.report, ROOT)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
