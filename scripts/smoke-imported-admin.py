#!/usr/bin/env python3
"""smoke-imported-admin.py — the R2-1 acceptance smoke, run against an
ACTUALLY IMPORTED legacy account (task t_33739716).

The R2-1 acceptance criterion "sign in with a real imported user" was never
satisfied: the original smoke used a fresh sign-up, because no imported user
existed. This script signs in through the app, then follows the identity all
the way to the data plane, asserting that every hop sees the SAME uuid that
owns the `user_roles` row:

  1. POST /api/auth/login  (the app's own route) → 200, session cookies set.
  2. GET  /api/auth/session (cookie) → user.id == the imported uuid.
  3. GET  {NEON_AUTH_BASE_URL}/token → JWT whose `sub` is that same uuid.
  4. GET  {NEON_DATA_API_URL}/user_roles?...  with that JWT (RLS, real
     policy) → the role row for that uuid, i.e. `admin`.
  5. GET  /api/admin/users (cookie) → the admin People list, which joins
     listAuthUsers() (neon_auth."user") with roles/profiles by id, so it is
     where legacy customers used to vanish.

Step 5 needs the Supabase-era data client env (NEXT_PUBLIC_SUPABASE_URL /
ANON_KEY) that `loadRole()` still uses until the Phase-3 data-client swap. In
a checkout without it the route fails closed (403/500) while steps 1-4 still
prove the identity chain; that is reported as SKIP unless --require-admin-api
is passed. Pass --require-admin-api in an environment that has the data client
so the People-list assertion is hard.

Secrets: the password is an argument (or QA_ADMIN_PASSWORD). It is never
printed and never written to the evidence report; only the JWT's decoded
claims and HTTP statuses are recorded.

Usage:
  python3 scripts/smoke-imported-admin.py --email qa.admin@adroit.io \
      --password "$QA_ADMIN_PASSWORD" [--expect-id <uuid>] \
      [--app http://localhost:3000] [--require-admin-api]
Exit 0 = PASS (or PASS with the documented SKIP). Exit 1 = FAIL.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
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


def record(check: str, ok, *, expected: str, detail=None) -> None:
    """ok is True / False / None (None = skipped)."""
    RESULTS.append({"check": check, "ok": ok, "expected": expected, "detail": detail})
    label = "SKIP" if ok is None else ("PASS" if ok else "FAIL")
    print(f"  [{label}] {check:<52}{'' if ok is not False else ' <<< ' + expected}")
    if detail is not None:
        print(f"         {json.dumps(detail, default=str)[:400]}")


def http(method: str, url: str, *, body=None, headers=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode(errors="replace")
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw[:400]
            return resp.status, parsed, dict(resp.headers)
    except urllib.error.HTTPError as err:
        raw = err.read().decode(errors="replace")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw[:400]
        return err.code, parsed, dict(err.headers)


def db_uuid_for_email(db_url: str, email: str) -> str | None:
    proc = subprocess.run(
        ["psql", db_url, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
         f"SELECT id::text FROM neon_auth.\"user\" WHERE lower(email) = lower('{email}')"],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0:
        return None
    value = proc.stdout.strip()
    return value or None


def cookie_header(headers: dict) -> str:
    jar = [line for key, line in headers.items() if key.lower() == "set-cookie"]
    return "; ".join(part.split(";")[0] for part in jar)


def decode_jwt_claims(token: str) -> dict:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload.replace("-", "+").replace("_", "/")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True, help="imported legacy account email")
    parser.add_argument("--password", default=os.environ.get("QA_ADMIN_PASSWORD"),
                        help="password for that account (or QA_ADMIN_PASSWORD)")
    parser.add_argument("--expect-id", default=None, help="expected uuid (default: look up by email)")
    parser.add_argument("--app", default=os.environ.get("APP_URL", "http://localhost:3000"))
    parser.add_argument("--report", default=os.path.join(ROOT, "reports", "imported-admin-smoke.json"))
    parser.add_argument("--require-admin-api", action="store_true",
                        help="make the /api/admin/users assertion hard (needs the data client env)")
    args = parser.parse_args()

    load_dotenv()
    if not args.password:
        raise SystemExit("--password (or QA_ADMIN_PASSWORD) is required")
    app = args.app.rstrip("/")
    db_url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL_UNPOOLED (or DATABASE_URL) is required")
    auth_base = (os.environ.get("NEON_AUTH_BASE_URL") or "").rstrip("/")
    data_base = (os.environ.get("NEON_DATA_API_URL") or "").rstrip("/")
    if not auth_base or not data_base:
        raise SystemExit("NEON_AUTH_BASE_URL and NEON_DATA_API_URL are required")

    expect_id = args.expect_id or db_uuid_for_email(db_url, args.email)
    if not expect_id:
        raise SystemExit(f"no neon_auth identity for {args.email}")
    print(f"imported identity: {args.email} → {expect_id}")

    # ── 1. sign in through the app's own route ─────────────────────────
    print("1. POST /api/auth/login (app route)")
    status, body, headers = http(
        "POST", f"{app}/api/auth/login",
        body={"mode": "signin", "email": args.email, "password": args.password},
        headers={"Origin": app},
    )
    cookies = cookie_header(headers)
    record("app.signin", status == 200 and isinstance(body, dict) and body.get("status") == "ok",
           expected="200 {status: ok} for an imported legacy account",
           detail={"status": status, "body": body, "cookies_set": bool(cookies)})
    if not cookies:
        return finish(args, "FAIL")

    # ── 2. session resolves the imported uuid ──────────────────────────
    print("2. GET /api/auth/session (cookie)")
    status, body, _ = http("GET", f"{app}/api/auth/session", headers={"Cookie": cookies})
    user = (body or {}).get("user") if isinstance(body, dict) else None
    record("session.user_id", status == 200 and user and user.get("id") == expect_id,
           expected=f"user.id == {expect_id}",
           detail={"status": status, "user": user})

    # ── 3. JWT sub is the same uuid (the identity the Data API trusts) ─
    print("3. GET {auth}/token → JWT sub")
    status, body, _ = http("GET", f"{auth_base}/token", headers={"Cookie": cookies})
    token = body.get("token") if isinstance(body, dict) else None
    claims = decode_jwt_claims(token) if token else {}
    record("jwt.sub", status == 200 and claims.get("sub") == expect_id,
           expected=f"JWT sub == {expect_id}",
           detail={"status": status, "sub": claims.get("sub")})
    if not token:
        return finish(args, "FAIL")

    # ── 4. RLS/data plane: the role row is reachable as that identity ──
    print("4. GET {data}/user_roles (RLS, real JWT)")
    status, body, _ = http("GET",
                           f"{data_base}/user_roles?select=role&user_id=eq.{expect_id}",
                           headers={"Authorization": f"Bearer {token}"})
    roles = [r.get("role") for r in body] if isinstance(body, list) else body
    record("data_plane.role", status == 200 and roles == ["admin"],
           expected="200 [{'role':'admin'}] for the imported admin",
           detail={"status": status, "roles": roles})

    # ── 5. admin People list (needs the Supabase-era data client env) ──
    print("5. GET /api/admin/users (People list)")
    has_data_client = bool(os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
                           and os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
    status, body, _ = http("GET", f"{app}/api/admin/users", headers={"Cookie": cookies})
    people = body.get("data") if isinstance(body, dict) else None
    ok_status = status == 200
    ok_list = isinstance(people, list) and len(people) > 0
    if not has_data_client and not args.require_admin_api:
        record("admin.people_list", None,
               expected="200 with the full People list",
               detail={"status": status,
                       "skipped_because": "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY absent in this "
                                          "checkout (Phase-3 data client not swapped yet); "
                                          "role resolution is proven in steps 2-4"})
    else:
        record("admin.people_list", ok_status and ok_list,
               expected="200 with the full People list",
               detail={"status": status, "people": len(people) if isinstance(people, list) else None,
                       "body": body if not ok_status else None})

    return finish(args, "PASS")


def finish(args, fallback: str) -> int:
    failed = [r["check"] for r in RESULTS if r["ok"] is False]
    skipped = [r["check"] for r in RESULTS if r["ok"] is None]
    verdict = "FAIL" if failed else fallback
    passed = sum(1 for r in RESULTS if r["ok"] is True)
    print(f"\n{verdict} ({passed} passed, {len(failed)} failed, {len(skipped)} skipped)"
          + (f" failed: {failed}" if failed else ""))
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as handle:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "email": args.email,
            "verdict": verdict,
            "checks": RESULTS,
        }, handle, indent=2, default=str)
    print(f"evidence: {os.path.relpath(args.report, ROOT)}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
