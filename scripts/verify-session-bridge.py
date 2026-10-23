#!/usr/bin/env python3
"""verify-session-bridge.py — prove the Neon Auth session JWT reaches the
Data API, so RLS-scoped reads run as the signed-in user (task t_f34aebeb).

The defect this guards (filed by val-el on t_cd36c47c, HIGH CWE-284/862): the
data client was built with an anon key and never presented the caller's
session, so every read ran as Postgres role `anonymous`, `loadRole()` returned
null and `/api/admin/*` answered 403 to a real imported admin. `src/lib/db/
server.ts` now resolves the session JWT from the httpOnly Managed Better Auth
cookie and sends it as `Authorization: Bearer <jwt>`; this script measures the
result over HTTP, not by mocking.

It proves, in order:

  1. ANONYMOUS  — `/token/anonymous` yields a JWT, and with it `user_roles`,
     `user_entitlements` and `user_profiles` return ZERO rows. The fix must not
     open those tables to anonymous (acceptance criterion 3).
  2. NO TOKEN   — the same tables, requested with no Authorization header, do
     not expose rows either (401, or an empty set).
  3. TOKEN       — a signed-in identity's JWT resolves that identity's own
     `user_roles` row and nothing else: empty before the role exists, the
     `admin` row once it does (criterion 4, "no token => anonymous,
     token => RLS row"), and anonymous still sees nothing.
  4. APP         — with `--app-url`, the real request path: `POST /api/auth/
     login` on the running app, then `GET /api/admin/users` with the session
     cookie → 200 and the imported admins listed; after the role row is
     removed → 403; anonymous → 403 (criteria 1 and 2).
  5. CLEANUP     — the throwaway identity and its role row are deleted and
     their absence is re-read.

A throwaway identity is used, never a real customer: the operator's password
for an imported account is not available to this worker, and the mechanism is
identity-agnostic — step 4 exercises the same `loadRole()` → `isAdmin()` chain
against live RLS. The real imported admins are asserted as DATA (their rows
appear in the People list), and the psql-free role impersonation that shows the
policies resolve for `chris.sympson@gmail.com` is recorded separately in the
card's evidence.

Secrets: the password is generated per run (or given with --password /
$QA_SESSION_PASSWORD). It is never printed and never written to the report.

Usage:
  python3 scripts/verify-session-bridge.py [--app-url http://localhost:3000] \
      [--email kelex1812+qa-bridge-<ts>@gmail.com] [--password ...] \
      [--allow-live-db [--allow-production-db]]
Exit 0 = every check passed. 1 = a check failed. 2 = configuration error.

Database guard (security audit F6, task t_9aba2d2e): steps 3-5 seed an `admin`
row into public.user_roles and then DELETE the throwaway identity from
public."user" / neon_auth.*, so this harness refuses any non-local database
without --allow-live-db, and refuses the PRODUCTION Neon endpoint without
--allow-production-db on top. See scripts/live_db_guard.py.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_db_guard import add_guard_arguments, require_safe_db_target  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://adroit.io"
REAL_ADMINS = (
    "chris.sympson@gmail.com",
    "juliannemsward@gmail.com",
    "qa.admin@adroit.io",
)
RESULTS: list[dict] = []


# --------------------------------------------------------------------------
# plumbing
# --------------------------------------------------------------------------


def record(check: str, ok: bool, *, expected: str, detail=None) -> None:
    RESULTS.append({"check": check, "ok": ok, "expected": expected,
                    "detail": _scrub(detail)})
    print(f"  [{'PASS' if ok else 'FAIL'}] {check:<46} {'' if ok else '<<< ' + expected}")
    if detail is not None:
        print(f"         {json.dumps(_scrub(detail), default=str)[:300]}")


def _scrub(value):
    if isinstance(value, dict):
        return {k: ("«redacted»" if k.lower() in ("token", "cookie", "password")
                    and isinstance(v, str) else _scrub(v))
                for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def http(method: str, url: str, *, token: str | None = None, cookie: str | None = None,
         body=None, headers=None):
    data = None
    hdrs = {"Origin": ORIGIN, "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if cookie:
        hdrs["Cookie"] = cookie
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode() or "null"
            return resp.status, _parse(raw), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, _parse(exc.read().decode() or "null"), dict(exc.headers)


def _parse(raw: str):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw[:300]


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


def psql(query: str, db_url: str) -> str:
    proc = subprocess.run(
        ["psql", db_url, "-X", "-q", "-A", "-F", "\t", "-t", "-v", "ON_ERROR_STOP=1",
         "-c", query],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def cookie_header(headers) -> str:
    return "; ".join(value.split(";")[0] for key, value in headers.items()
                     if key.lower() == "set-cookie")


def jwt_sub(token: str) -> str:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload.replace("-", "+").replace("_", "/")))
    return claims["sub"]


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------


def check_anonymous(data_url: str) -> str:
    print("\n== 1. anonymous role sees no identity rows (criterion 3)")
    status, body, _ = http("GET", f"{auth_url_global}/token/anonymous")
    token = body.get("token") if isinstance(body, dict) else None
    record("anonymous.token.issued", status == 200 and bool(token),
           expected="200 with an anonymous JWT", detail={"status": status})
    if not token:
        raise SystemExit("cannot obtain the anonymous JWT")

    for table in ("user_roles", "user_entitlements", "user_profiles"):
        status, rows, _ = http("GET", f"{data_url}/{table}?select=*&limit=5", token=token)
        record(f"anonymous.{table}.empty", status == 200 and rows == [],
               expected="200 with 0 rows for role anonymous",
               detail={"status": status, "rows": rows})

    print("\n== 2. no Authorization header exposes no rows (criterion 3)")
    for table in ("user_roles", "user_entitlements"):
        status, rows, _ = http("GET", f"{data_url}/{table}?select=*&limit=5")
        # The Data API gateway answers 400 "missing authentication credentials"
        # for a bare request (no implicit role); 401/403 if that ever tightens.
        denied = status in (400, 401, 403)
        record(f"notoken.{table}.blocked", denied or (status == 200 and rows == []),
               expected="400/401/403, or 200 with 0 rows, without a token",
               detail={"status": status, "rows": rows})
    return token


def provision_identity(auth_url: str, email: str, password: str):
    """Sign up if unknown, then sign in. Returns (jwt, user_id, cookie)."""
    status, body, _ = http("POST", f"{auth_url}/sign-up/email",
                           body={"email": email, "password": password,
                                 "name": f"QA session bridge {email}"})
    created = status in (200, 201)
    status, body, headers = http("POST", f"{auth_url}/sign-in/email",
                                 body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"cannot sign in {email}: HTTP {status} {str(body)[:200]}")
    cookie = cookie_header(headers)
    status, body, _ = http("GET", f"{auth_url}/token", cookie=cookie)
    token = body.get("token") if isinstance(body, dict) else None
    if status != 200 or not token:
        raise SystemExit(f"cannot fetch a session JWT: HTTP {status}")
    return token, jwt_sub(token), cookie, created


def check_token_path(data_url: str, db_url: str, user_id: str, token: str, anon_token: str):
    print("\n== 3. session JWT resolves exactly its own role row (criterion 4)")
    query = f"/user_roles?select=role&user_id=eq.{user_id}"

    status, rows, _ = http("GET", f"{data_url}{query}", token=token)
    record("session.user_roles.before_role", status == 200 and rows == [],
           expected="200 with 0 rows before the role exists (not 'everything visible')",
           detail={"status": status, "rows": rows})

    psql(f'INSERT INTO public.user_roles (user_id, role) VALUES (\'{user_id}\', \'admin\') '
         f'ON CONFLICT (user_id) DO UPDATE SET role = \'admin\';', db_url)
    seeded = psql(f'SELECT role FROM public.user_roles WHERE user_id = \'{user_id}\';', db_url)
    record("seed.admin_role", seeded == "admin", expected="role=admin seeded for the QA id",
           detail={"role": seeded or None})

    status, rows, _ = http("GET", f"{data_url}{query}", token=token)
    record("session.user_roles.with_token", status == 200 and rows == [{"role": "admin"}],
           expected="200 [{'role': 'admin'}] — RLS row visible with the session JWT",
           detail={"status": status, "rows": rows})

    status, rows, _ = http("GET", f"{data_url}{query}", token=anon_token)
    record("anonymous.user_roles.still_empty", status == 200 and rows == [],
           expected="0 rows — the same row is invisible without the session JWT",
           detail={"status": status, "rows": rows})


def check_app(app_url: str, data_url: str, db_url: str, email: str, password: str,
              user_id: str) -> None:
    print("\n== 4. the app's own request path (criteria 1 and 2)")
    status, body, headers = http("POST", f"{app_url}/api/auth/login",
                                 body={"mode": "signin", "email": email,
                                       "password": password})
    cookie = cookie_header(headers)
    record("app.signin", status == 200 and bool(cookie),
           expected="200 and a session cookie from the app's login route",
           detail={"status": status, "body": body})

    status, body, _ = http("GET", f"{app_url}/api/auth/session", cookie=cookie)
    seen = (body or {}).get("user", {}) if isinstance(body, dict) else {}
    record("app.session.user_id", status == 200 and seen.get("id") == user_id,
           expected=f"/api/auth/session resolves {user_id}",
           detail={"status": status, "user": seen})

    status, body, _ = http("GET", f"{app_url}/api/admin/users", cookie=cookie)
    # The contract is `{ ok, data: AdminUserListRow[] }` (older shapes returned a
    # bare array — accept both so this keeps measuring the gate, not the envelope).
    if isinstance(body, dict):
        rows = body.get("data")
    else:
        rows = body
    emails = {row.get("email") for row in rows if isinstance(row, dict)} if isinstance(rows, list) else set()
    listed_real = sorted(e for e in REAL_ADMINS if e in emails)
    record("app.admin_users.as_admin", status == 200 and isinstance(rows, list) and len(listed_real) == len(REAL_ADMINS),
           expected="200 listing the imported admins (the bug was 403 here)",
           detail={"status": status, "rows": len(rows) if isinstance(rows, list) else rows,
                   "imported_admins_listed": listed_real})

    if isinstance(rows, list) and rows:
        status_admin = {r.get("role") for r in rows if isinstance(r, dict)}
        record("app.admin_users.roles_resolved", "admin" in status_admin,
               expected="rows carry role 'admin' (loadRole() is not null)",
               detail={"roles": sorted(x for x in status_admin if x)})

    # Same request as a signed-in NON-admin: remove the role row, retry.
    psql(f'DELETE FROM public.user_roles WHERE user_id = \'{user_id}\';', db_url)
    status, body, _ = http("GET", f"{app_url}/api/admin/users", cookie=cookie)
    record("app.admin_users.as_member", status == 403,
           expected="403 once the caller is no longer an admin",
           detail={"status": status, "body": body})

    status, body, _ = http("GET", f"{app_url}/api/admin/users")
    record("app.admin_users.as_anonymous", status in (401, 403),
           expected="401/403 with no session",
           detail={"status": status, "body": body})


def cleanup(db_url: str, user_id: str) -> None:
    print("\n== 5. cleanup")
    psql(f'DELETE FROM public.user_roles WHERE user_id = \'{user_id}\';', db_url)
    psql(f'DELETE FROM public."user" WHERE id = \'{user_id}\';', db_url)
    for table, column in (("session", '"userId"'), ("account", '"userId"'), ("user", "id")):
        if psql(f"SELECT to_regclass('neon_auth.{table}') IS NOT NULL;", db_url) != "t":
            continue
        psql(f'DELETE FROM neon_auth."{table}" WHERE {column} = \'{user_id}\';', db_url)
    left = psql(
        "SELECT (SELECT count(*) FROM public.\"user\" WHERE id = '%s') || '|' || "
        "(SELECT count(*) FROM public.user_roles WHERE user_id = '%s') || '|' || "
        "(SELECT count(*) FROM neon_auth.\"user\" WHERE id = '%s');" % (user_id, user_id, user_id),
        db_url)
    record("cleanup.identity_removed", left == "0|0|0",
           expected="0|0|0 rows for the throwaway identity",
           detail={"counts": left})


# --------------------------------------------------------------------------

auth_url_global = ""


def main() -> int:
    global auth_url_global
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default=None, help="throwaway identity (default: timestamped)")
    parser.add_argument("--password", default=os.environ.get("QA_SESSION_PASSWORD"),
                        help="password for the throwaway identity (default: generated)")
    parser.add_argument("--app-url", default=None,
                        help="running app, e.g. http://localhost:3000 (enables criterion 1/2)")
    parser.add_argument("--report", default=os.path.join(ROOT, "reports",
                                                         "session-bridge-evidence.json"))
    add_guard_arguments(parser)
    args = parser.parse_args()

    load_dotenv()
    auth_url = os.environ.get("NEON_AUTH_BASE_URL", "").rstrip("/")
    data_url = os.environ.get("NEON_DATA_API_URL", "").rstrip("/")
    db_url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not (auth_url and data_url and db_url):
        print("NEON_AUTH_BASE_URL, NEON_DATA_API_URL and DATABASE_URL_UNPOOLED are required")
        return 2
    # Security audit F6 (t_9aba2d2e): this harness seeds an admin role row and
    # DELETEs identities, and DATABASE_URL_UNPOOLED in .env.local is the
    # production endpoint. Refuse anything that was not explicitly opted into.
    db_host = require_safe_db_target(db_url, allow_live_db=args.allow_live_db,
                                     allow_production_db=args.allow_production_db)
    auth_url_global = auth_url

    email = args.email or (
        "kelex1812+qa-bridge-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "@gmail.com")
    password = args.password or ("Bridge-" + secrets.token_urlsafe(18) + "!9")

    print(f"auth={auth_url.split('//')[-1].split('/')[0]}  "
          f"data={data_url.split('//')[-1].split('/')[0]}  app={args.app_url or '(none)'}  "
          f"db={db_host}")

    user_id: str | None = None
    try:
        anon_token = check_anonymous(data_url)
        token, user_id, _cookie, created = provision_identity(auth_url, email, password)
        print(f"  throwaway identity {user_id} ({email}, created={created})")
        record("session.jwt.sub", user_id == jwt_sub(token),
               expected="session JWT sub is the identity id", detail={"user_id": user_id})
        check_token_path(data_url, db_url, user_id, token, anon_token)
        if args.app_url:
            check_app(args.app_url.rstrip("/"), data_url, db_url, email, password, user_id)
    finally:
        try:
            if user_id is not None:
                cleanup(db_url, user_id)
        except Exception as exc:  # cleanup must never mask the verdict
            print(f"  cleanup error: {exc}")

    passed = sum(1 for r in RESULTS if r["ok"])
    failed = [r["check"] for r in RESULTS if not r["ok"]]
    verdict = "PASS" if not failed else "FAIL"
    print(f"\n{verdict} ({passed}/{len(RESULTS)} assertions)"
          + (f" failed: {failed}" if failed else ""))
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as handle:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(),
                   "app_url": args.app_url,
                   "assertions_total": len(RESULTS),
                   "assertions_passed": passed,
                   "verdict": verdict,
                   "results": RESULTS}, handle, indent=2)
    print(f"evidence: {args.report}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
