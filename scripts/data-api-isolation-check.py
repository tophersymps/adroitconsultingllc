#!/usr/bin/env python3
"""
Data API RLS isolation check — Neon Managed Better Auth + Neon Data API.

Proves, end to end over HTTP (not psql), that two signed-in users cannot see or
mutate each other's rows, that the anonymous role only sees the public catalog,
and that the owning user can still perform their legitimate writes. A policy
set that blocks *everything* would pass a naive leak test while silently
breaking the product, so the "legitimate write" checks are as important as the
isolation ones.

What it does
------------
1. Signs in two QA users against Neon Auth (creating them with /sign-up/email
   if they do not exist yet) and fetches per-user bearer JWTs from /token.
2. Fetches an anonymous-role JWT from /token/anonymous.
3. Runs the raw "brand new account" own-write probe: a freshly signed-up
   Better Auth user inserts their own lesson_completion over the Data API.
   This catches user-provisioning gaps (e.g. no row in public."user" for the
   FK) that would break every write for every new sign-up.
4. Optionally mirrors the QA users into public."user" (the FK target) so the
   RLS policies themselves can be exercised independently of the missing
   user-sync. Disable with --no-mirror.
5. Seeds owner rows (via the privileged connection, for tables the client is
   not allowed to insert: quiz_attempt, quiz_run, admin_audit_log) and own
   rows over the Data API for the tables the client does write.
6. Runs the cross-user / anonymous / no-token read matrix and the cross-user
   write attempts.
7. Cleans up the seeded rows (users are left in place so re-runs are cheap)
   and writes machine-readable evidence to
   reports/data-api-isolation-evidence.json.

Exit codes
----------
0  every check passed
1  at least one check failed (leak, broken legitimate write, or write not
   rejected)
2  configuration / auth error (bad endpoints, cannot sign in, no DB URL)

Usage
-----
    export NEON_AUTH_BASE_URL=... NEON_DATA_API_URL=...
    export DATABASE_URL_UNPOOLED=...        # seeding + user mirror (owner conn)
    python3 scripts/data-api-isolation-check.py --password "$QA_PASSWORD"

The two endpoint URLs are also resolved from Bitwarden Secrets Manager when
BWS_ACCESS_TOKEN is set, and the DB URL from .env.local at the repo root.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

AUTH_URL: str = ""
DATA_API: str = ""
DB_URL: str = ""
USER_A_ID: str = ""
USER_B_ID: str = ""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_PATH = os.path.join(ROOT, "reports", "data-api-isolation-evidence.json")

BWS_AUTH_SECRET_ID = os.environ.get("NEON_AUTH_SECRET_ID", "44c1602c-e154-44c1-a24a-b4ec00fe8a73")
BWS_DATA_SECRET_ID = os.environ.get("NEON_DATA_API_SECRET_ID", "f08ae7d4-a73c-4afa-a333-b4ec00fe8aa9")
ORIGIN = "https://adroit.io"

DEFAULT_EMAIL_A = "kelex1812+qa-neon-r15-a@gmail.com"
DEFAULT_EMAIL_B = "kelex1812+qa-neon-r15-b@gmail.com"

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

# table -> owner column. user_id for the user-scoped tables, actor_user_id for
# the admin audit log (its INSERT/UPDATE/DELETE policies are admin-only).
USER_TABLES = {
    "lesson_completion": "user_id",
    "read_progress": "user_id",
    "quiz_attempt": "user_id",
    "quiz_run": "user_id",
    "user_profiles": "user_id",
    "admin_audit_log": "actor_user_id",
}

PUBLIC_CATALOG = ["courses", "catalog_sections", "catalog_groups"]

RESULTS: list[dict] = []


# --------------------------------------------------------------------------
# plumbing
# --------------------------------------------------------------------------


def _scrub(value):
    """Never persist a bearer token in the evidence file."""
    if isinstance(value, dict):
        return {k: (f"«redacted:{len(v)}chars»" if k == "token" and isinstance(v, str) else _scrub(v))
                for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def record(check, *, kind, table, caller, method, path, status=None, ok=False,
           expected=None, detail=None, severity="high"):
    RESULTS.append({
        "check": check,
        "kind": kind,
        "table": table,
        "caller": caller,
        "method": method,
        "path": path,
        "status": status,
        "expected": expected,
        "detail": _scrub(detail),
        "ok": ok,
        "severity": severity,
    })
    flag = "PASS" if ok else "FAIL"
    print(f"  [{flag}] {caller:<10} {method:<6} {path:<64} "
          f"status={status} rows={_rows_of(detail)} {'' if ok else '<<< ' + str(expected)}")


def _rows_of(detail):
    if isinstance(detail, list):
        return len(detail)
    if isinstance(detail, dict) and "rows" in detail:
        return detail["rows"]
    return "-"


def http(method, url, *, token=None, body=None, extra_headers=None):
    """Returns (status, parsed_body_or_text, headers)."""
    data = None
    headers = {"Origin": ORIGIN, "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode() or "null"
            return resp.status, _parse(raw), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode() or "null"
        return exc.code, _parse(raw), dict(exc.headers)


def _parse(raw):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw[:400]


def api(method, path, *, token=None, body=None, headers=None):
    # a single 5xx from the Data API is a transient platform hiccup, not an
    # isolation result — retry once so the matrix does not flake
    status, parsed, hdrs = http(method, f"{DATA_API}{path}", token=token, body=body,
                                extra_headers=headers)
    if status >= 500:
        time.sleep(1.5)
        status, parsed, hdrs = http(method, f"{DATA_API}{path}", token=token, body=body,
                                    extra_headers=headers)
    return status, parsed, hdrs


def auth(method, path, *, body=None, cookie=None):
    hdrs = {"Origin": ORIGIN}
    if cookie:
        hdrs["Cookie"] = cookie
    return http(method, f"{AUTH_URL}{path}", body=body, extra_headers=hdrs)


def jwt_sub(token):
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload.replace("-", "+").replace("_", "/")))
    return claims


def sql(query):
    """Owner connection — fixture/seed/cleanup only, never part of the proof."""
    proc = subprocess.run(
        ["psql", DB_URL, "-X", "-q", "-A", "-F", "\t", "-t", "-c", query],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def sql_id_list(ids):
    for value in ids:
        if not UUID_RE.match(value):
            raise SystemExit(f"refusing to interpolate non-uuid value into SQL: {value!r}")
    return ",".join(f"'{value}'" for value in ids)


def load_dotenv():
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def resolve_endpoint(env_key, secret_id, label):
    value = os.environ.get(env_key)
    if value:
        return value.rstrip("/")
    token = os.environ.get("BWS_ACCESS_TOKEN")
    if not token:
        raise SystemExit(
            f"{env_key} is not set and BWS_ACCESS_TOKEN is absent; export {env_key} "
            f"(Bitwarden secret {label}={secret_id})"
        )
    proc = subprocess.run(
        ["bws", "secret", "get", secret_id, "-o", "json"],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise SystemExit(f"bws lookup for {label} failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)["value"].rstrip("/")


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------


def sign_in(email, password):
    """Returns (token, user_id). Creates the account on first run."""
    status, body, headers = auth("POST", "/sign-in/email", body={"email": email, "password": password})
    if status != 200:
        status, body, _ = auth("POST", "/sign-up/email",
                               body={"email": email, "password": password, "name": f"QA R1-5 {email}"})
        if status not in (200, 201):
            raise SystemExit(f"cannot create QA user {email}: HTTP {status} {str(body)[:300]}")
        status, body, headers = auth("POST", "/sign-in/email", body={"email": email, "password": password})
        if status != 200:
            raise SystemExit(f"cannot sign in {email}: HTTP {status} {str(body)[:300]}")

    cookies = _cookies(headers)
    status, body, _ = auth("GET", "/token", cookie=cookies)
    if status != 200 or not isinstance(body, dict) or "token" not in body:
        raise SystemExit(f"cannot fetch token for {email}: HTTP {status} {str(body)[:300]}")
    claims = jwt_sub(body["token"])
    return body["token"], claims["sub"]


def _cookies(headers):
    jar = []
    for key, value in headers.items():
        if key.lower() == "set-cookie":
            jar.append(value.split(";")[0])
    return "; ".join(jar)


def anonymous_token():
    status, body, _ = auth("GET", "/token/anonymous")
    if status != 200 or not isinstance(body, dict) or "token" not in body:
        return None, status, body
    return body["token"], status, body


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------


def read_check(label, table, token, owner_col, own_id=None, *, expect_rows=None):
    status, body, _ = api("GET", f"/{table}?select={owner_col}", token=token)
    rows = body if isinstance(body, list) else []
    ok = status == 200
    if ok and expect_rows == "none":
        ok = len(rows) == 0
    if ok and own_id is not None:
        ok = ok and all(row.get(owner_col) == own_id for row in rows)
    record(label, kind="read", table=table, caller=label.split(":")[0], method="GET",
           path=f"/{table}", status=status, ok=ok,
           expected=expect_rows or f"only rows where {owner_col}=own id", detail=rows)
    return rows


def cross_user_read(label, table, token, owner_col, other_id):
    status, body, _ = api("GET", f"/{table}?select={owner_col}&{owner_col}=eq.{other_id}", token=token)
    rows = body if isinstance(body, list) else []
    ok = status == 200 and len(rows) == 0
    record(label, kind="read", table=table, caller=label.split(":")[0], method="GET",
           path=f"/{table}?{owner_col}=eq.<other>", status=status, ok=ok,
           expected="0 rows (RLS hides other user's rows)", detail=rows)


def write_denied(label, table, token, body=None, path=None, method="POST", caller=None):
    status, resp, _ = api(method, path or f"/{table}", token=token, body=body,
                          headers={"Prefer": "return=representation"})
    ok = status in (401, 403)
    record(label, kind="write", table=table, caller=caller or label.split(":")[0],
           method=method, path=path or f"/{table}", status=status, ok=ok,
           expected="401/403 (RLS denies)", detail=resp if not isinstance(resp, list) else resp)


def no_token_check(table):
    status, body, _ = api("GET", f"/{table}?select=*")
    ok = status in (400, 401)
    record(f"no-token:{table}", kind="read", table=table, caller="no-token", method="GET",
           path=f"/{table}", status=status, ok=ok,
           expected="400/401 (gateway rejects unauthenticated)", detail=body)


def zero_row_effect(label, table, token, path, method="PATCH", body=None):
    status, resp, _ = api(method, path, token=token, body=body,
                          headers={"Prefer": "return=representation"})
    affected = resp if isinstance(resp, list) else []
    ok = status in (200, 204) and len(affected) == 0
    record(label, kind="write", table=table, caller=label.split(":")[0], method=method,
           path=path.split("?")[0], status=status, ok=ok,
           expected="200/204 with 0 rows affected (RLS filters the row out)", detail=affected)


# --------------------------------------------------------------------------
# fixture + seed
# --------------------------------------------------------------------------


def mirror_users(users):
    """Populate public.\"user\" for the Better Auth users (the FK target).

    Managed Better Auth keeps identities in neon_auth.\"user\" and does not write
    public.\"user\", which is the Supabase-era table the user-scoped FKs point at.
    Without this mirror every write by a new sign-up fails with FK 23503.
    """
    values = ",".join(
        f"('{uid}', '{email}', '{email}', true, now(), now())"
        for uid, email in users
    )
    sql(
        'insert into public."user" (id, name, email, emailverified, createdat, updatedat) '
        f"values {values} on conflict (id) do nothing;"
    )


def have_mirror(users):
    ids = sql_id_list([uid for uid, _ in users])
    present = sql(f'select count(*) from public."user" where id in ({ids});')
    return int(present or 0) == len(users)


def clear_user_rows(table, owner_col, ids):
    sql(f"delete from public.{table} where {owner_col} in ({sql_id_list(ids)});")


def seed_api_rows(table, token, user_id, payload, path=None, prefer="return=representation"):
    status, body, _ = api("POST", path or f"/{table}", token=token, body=payload,
                          headers={"Prefer": prefer})
    return status, body


def seed_owner_rows():
    a, b = USER_A_ID, USER_B_ID
    sql(f"""insert into public.quiz_attempt
              (user_id, quiz_name, question_index, correct_answer_index, user_answer_index, is_correct)
            values ('{a}','qa-r15',0,1,1,true), ('{b}','qa-r15',0,1,1,true);""")
    sql(f"""insert into public.quiz_run (user_id, quiz_name, correct, total, score)
            values ('{a}','qa-r15',1,1,100), ('{b}','qa-r15',1,1,100);""")
    sql(f"""insert into public.admin_audit_log
              (actor_user_id, action, target_type, target_id, details)
            values ('{a}','qa.r15.seed','qa','qa-a','{{"check":"r1-5"}}'),
                   ('{b}','qa.r15.seed','qa','qa-b','{{"check":"r1-5"}}');""")


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main():
    global AUTH_URL, DATA_API, DB_URL, USER_A_ID, USER_B_ID

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--password", default=os.environ.get("QA_R15_PASSWORD"),
                        help="password for both QA users (or QA_R15_PASSWORD)")
    parser.add_argument("--email-a", default=DEFAULT_EMAIL_A)
    parser.add_argument("--email-b", default=DEFAULT_EMAIL_B)
    parser.add_argument("--no-mirror", action="store_true",
                        help="do not populate public.\"user\"; matrix will mostly fail on FK")
    parser.add_argument("--keep-rows", action="store_true", help="skip cleanup of seeded rows")
    args = parser.parse_args()

    if not args.password:
        raise SystemExit("--password or QA_R15_PASSWORD is required")

    load_dotenv()
    AUTH_URL = resolve_endpoint("NEON_AUTH_BASE_URL", BWS_AUTH_SECRET_ID, "NEON_AUTH_BASE_URL")
    DATA_API = resolve_endpoint("NEON_DATA_API_URL", BWS_DATA_SECRET_ID, "NEON_DATA_API_URL")
    DB_URL = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL") or ""
    if not DB_URL:
        raise SystemExit("DATABASE_URL_UNPOOLED (or DATABASE_URL) is required for seeding")

    print(f"auth={AUTH_URL.split('//')[-1].split('/')[0]}  data={DATA_API.split('//')[-1].split('/')[0]}")

    # ---- auth ------------------------------------------------------------
    print("\n== auth")
    TOK_A, USER_A_ID = sign_in(args.email_a, args.password)
    TOK_B, USER_B_ID = sign_in(args.email_b, args.password)
    print(f"  user A = {USER_A_ID}\n  user B = {USER_B_ID}")
    ANON, anon_status, anon_body = anonymous_token()
    record("anon-role-token", kind="read", table="-", caller="anon", method="GET",
           path="/token/anonymous", status=anon_status, ok=ANON is not None,
           expected="200 with anonymous JWT", detail=anon_body)

    # ---- raw sign-up write probe (before any mirror) ----------------------
    print("\n== fresh-account own-write probe (no user mirror)")
    ids_sql = sql_id_list([USER_A_ID, USER_B_ID])
    if not args.no_mirror:
        # make the probe honest: drop any mirror left by an earlier run so the
        # QA users really are "just signed up" Better Auth identities
        sql(f'delete from public."user" where id in ({ids_sql});')
    mirror_before = have_mirror([(USER_A_ID, args.email_a), (USER_B_ID, args.email_b)])
    status, body = seed_api_rows("lesson_completion", TOK_A, USER_A_ID,
                                 {"user_id": USER_A_ID, "lesson_slug": "qa-r15-probe"})
    record("fresh-signup-own-write", kind="write", table="lesson_completion", caller="user-A",
           method="POST", path="/lesson_completion", status=status,
           ok=status in (200, 201), expected="201: a new account can write its own progress",
           detail=body)
    if not args.no_mirror and not mirror_before:
        print('  -> public."user" has no row for the Better Auth users; mirroring so the '
              "RLS policies can be exercised (see 'fresh-signup-own-write' finding)")
        mirror_users([(USER_A_ID, args.email_a), (USER_B_ID, args.email_b)])
    if status in (200, 201):
        api("DELETE", f"/lesson_completion?user_id=eq.{USER_A_ID}&lesson_slug=eq.qa-r15-probe",
            token=TOK_A, headers={"Prefer": "return=representation"})

    # ---- seed ------------------------------------------------------------
    print("\n== seed")
    # idempotency: drop anything a previous run left behind (owner conn, fixture only)
    for table, owner_col in (("lesson_completion", "user_id"), ("read_progress", "user_id"),
                             ("user_profiles", "user_id"), ("quiz_attempt", "user_id"),
                             ("quiz_run", "user_id"), ("admin_audit_log", "actor_user_id")):
        clear_user_rows(table, owner_col, [USER_A_ID, USER_B_ID])
    seed_api_rows("lesson_completion", TOK_A, USER_A_ID, {"user_id": USER_A_ID, "lesson_slug": "qa-r15-a"})
    seed_api_rows("lesson_completion", TOK_B, USER_B_ID, {"user_id": USER_B_ID, "lesson_slug": "qa-r15-b"})
    seed_api_rows("read_progress", TOK_A, USER_A_ID,
                  {"user_id": USER_A_ID, "content_type": "blog", "content_slug": "qa-r15-a"})
    seed_api_rows("read_progress", TOK_B, USER_B_ID,
                  {"user_id": USER_B_ID, "content_type": "blog", "content_slug": "qa-r15-b"})
    seed_api_rows("user_profiles", TOK_A, USER_A_ID, {"user_id": USER_A_ID, "display_name": "QA R1-5 A"})
    seed_api_rows("user_profiles", TOK_B, USER_B_ID, {"user_id": USER_B_ID, "display_name": "QA R1-5 B"})
    seed_owner_rows()
    print("  seeded: lesson_completion, read_progress, user_profiles (API); "
          "quiz_attempt, quiz_run, admin_audit_log (owner conn)")

    # ---- read matrix -----------------------------------------------------
    print("\n== read matrix")
    for table, owner_col in USER_TABLES.items():
        expect = "none" if table == "admin_audit_log" else None
        rows_a = read_check(f"user-A:own:{table}", table, TOK_A, owner_col, USER_A_ID, expect_rows=expect)
        read_check(f"user-B:own:{table}", table, TOK_B, owner_col, USER_B_ID, expect_rows=expect)
        cross_user_read(f"user-A:other:{table}", table, TOK_A, owner_col, USER_B_ID)
        cross_user_read(f"user-B:other:{table}", table, TOK_B, owner_col, USER_A_ID)
        if ANON:
            read_check(f"anon:read:{table}", table, ANON, owner_col, expect_rows="none")
        no_token_check(table)
        # the user tables must not leak the other user's ids even unfiltered
        if rows_a and any(row.get(owner_col) != USER_A_ID for row in rows_a):
            record(f"assumption:unfiltered-{table}", kind="read", table=table, caller="user-A",
                   method="GET", path=f"/{table}", status=200, ok=False,
                   expected="unfiltered select returns only own rows", detail=rows_a)

    # public catalog: every caller sees the same public rows, and nobody sees a
    # user-scoped row through it — anon and authenticated counts must be identical
    catalog_counts = {}
    for table in PUBLIC_CATALOG:
        paths = {}
        for who, token in (("user-A", TOK_A), ("anon", ANON)):
            if not token:
                continue
            path = f"/{table}?select=*"
            status, body, _ = api("GET", path, token=token)
            rows = body if isinstance(body, list) else []
            catalog_counts.setdefault(table, {})[who] = len(rows)
            paths[who] = (status, len(rows))
            record(f"{who}:catalog:{table}", kind="read", table=table, caller=who, method="GET",
                   path=path, status=status, ok=status == 200 and len(rows) > 0,
                   expected="200 with the public catalog rows", detail=rows)
        counts = catalog_counts.get(table, {})
        if len(counts) == 2:
            record(f"parity:anon-vs-auth:{table}", kind="read", table=table, caller="anon", method="GET",
                   path=f"/{table}", status=200, ok=counts["anon"] == counts["user-A"] and counts["anon"] > 0,
                   expected="anonymous sees exactly the same public rows as an authenticated user",
                   detail=counts)
        # the gateway itself must still refuse an unauthenticated caller
        status, body, _ = api("GET", f"/{table}?select=*", token=None)
        record(f"no-token:{table}", kind="read", table=table, caller="no-token", method="GET",
               path=f"/{table}?select=*", status=status, ok=status in (400, 401),
               expected="400/401 missing authentication credentials", detail=body)

    # ---- write matrix ----------------------------------------------------
    print("\n== write matrix")
    write_denied("user-A:insert-other:lesson_completion", "lesson_completion", TOK_A,
                 {"user_id": USER_B_ID, "lesson_slug": "qa-r15-leak"})
    write_denied("user-A:insert-other:read_progress", "read_progress", TOK_A,
                 {"user_id": USER_B_ID, "content_type": "blog", "content_slug": "qa-r15-leak"})
    write_denied("user-A:insert-other:user_profiles", "user_profiles", TOK_A,
                 {"user_id": USER_B_ID, "display_name": "leak"})
    write_denied("user-A:insert:quiz_attempt", "quiz_attempt", TOK_A,
                 {"user_id": USER_A_ID, "quiz_name": "qa-r15", "question_index": 0,
                  "correct_answer_index": 1, "user_answer_index": 1, "is_correct": True})
    write_denied("user-A:insert:admin_audit_log", "admin_audit_log", TOK_A,
                 {"actor_user_id": USER_A_ID, "action": "qa", "target_type": "qa", "target_id": "qa"})
    write_denied('user-A:read:public."user"', "-", TOK_A, path="/user?select=id", method="GET")
    write_denied("user-A:insert:user_roles", "user_roles", TOK_A,
                 {"user_id": USER_A_ID, "role": "admin"})
    if ANON:
        write_denied("anon:insert:read_progress", "read_progress", ANON,
                     {"user_id": USER_A_ID, "content_type": "blog", "content_slug": "qa-r15-anon"})
        write_denied("anon:insert:catalog_sections", "catalog_sections", ANON,
                     {"name": "qa-r15-anon", "slug": "qa-r15-anon"})

    zero_row_effect("user-A:update-other:read_progress", "read_progress", TOK_A,
                    f"/read_progress?user_id=eq.{USER_B_ID}",
                    body={"content_slug": "qa-r15-hijack"})
    zero_row_effect("user-A:update-other:user_profiles", "user_profiles", TOK_A,
                    f"/user_profiles?user_id=eq.{USER_B_ID}",
                    body={"display_name": "hijacked"})
    zero_row_effect("user-A:delete-other:lesson_completion", "lesson_completion", TOK_A,
                    f"/lesson_completion?user_id=eq.{USER_B_ID}", method="DELETE")

    # deleting own rows is legitimate
    status, resp, _ = api("DELETE", f"/lesson_completion?user_id=eq.{USER_A_ID}&lesson_slug=eq.qa-r15-a",
                          token=TOK_A, headers={"Prefer": "return=representation"})
    ok = status in (200, 204) and isinstance(resp, list) and len(resp) == 1
    record("user-A:delete-own:lesson_completion", kind="write", table="lesson_completion",
           caller="user-A", method="DELETE", path="/lesson_completion", status=status, ok=ok,
           expected="200/204, 1 row deleted", detail=resp)

    # ---- legitimate writes ----------------------------------------------
    print("\n== legitimate writes (must not be blocked)")
    status, resp = seed_api_rows(
        "read_progress", TOK_A, USER_A_ID,
        {"user_id": USER_A_ID, "content_type": "blog", "content_slug": "qa-r15-a"},
        path="/read_progress?on_conflict=user_id,content_slug",
        prefer="resolution=merge-duplicates,return=representation",
    )
    upsert_ok = status in (200, 201) and isinstance(resp, list) and len(resp) == 1 \
        and resp[0].get("user_id") == USER_A_ID
    record("user-A:upsert-own:read_progress", kind="write", table="read_progress",
           caller="user-A", method="POST", path="/read_progress?on_conflict=...", status=status,
           ok=upsert_ok, expected="200/201, 1 own row (merge-duplicates upsert)", detail=resp)

    status, resp, _ = api("PATCH", f"/read_progress?user_id=eq.{USER_A_ID}&content_slug=eq.qa-r15-a",
                          token=TOK_A, body={"content_type": "blog"},
                          headers={"Prefer": "return=representation"})
    patch_ok = status in (200, 204) and isinstance(resp, list) and len(resp) == 1
    record("user-A:update-own:read_progress", kind="write", table="read_progress",
           caller="user-A", method="PATCH", path="/read_progress", status=status, ok=patch_ok,
           expected="200/204, 1 row updated", detail=resp)

    status, resp, _ = api("GET", f"/user_profiles?select=user_id,display_name&user_id=eq.{USER_A_ID}",
                          token=TOK_A)
    own_profile = resp if isinstance(resp, list) else []
    record("user-A:select-own:user_profiles", kind="read", table="user_profiles", caller="user-A",
           method="GET", path="/user_profiles?user_id=eq.<own>", status=status,
           ok=status == 200 and len(own_profile) == 1, expected="200, 1 own row",
           detail=own_profile)

    # ---- cleanup ---------------------------------------------------------
    if not args.keep_rows:
        print("\n== cleanup")
        for table, owner_col in (("lesson_completion", "user_id"), ("read_progress", "user_id"),
                                 ("user_profiles", "user_id"), ("quiz_attempt", "user_id"),
                                 ("quiz_run", "user_id"), ("admin_audit_log", "actor_user_id")):
            clear_user_rows(table, owner_col, [USER_A_ID, USER_B_ID])
        print("  seeded rows removed (QA users and their public.\"user\" mirror kept for re-runs)")

    # ---- report ----------------------------------------------------------
    failures = [r for r in RESULTS if not r["ok"]]
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w") as handle:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "auth_host": AUTH_URL.split("//")[-1].split("/")[0],
            "data_host": DATA_API.split("//")[-1].split("/")[0],
            "users": {"a": USER_A_ID, "b": USER_B_ID},
            "checks_total": len(RESULTS),
            "checks_passed": len(RESULTS) - len(failures),
            "failures": [f["check"] for f in failures],
            "results": RESULTS,
        }, handle, indent=2)

    print(f"\n== {len(RESULTS) - len(failures)}/{len(RESULTS)} checks passed")
    if failures:
        print("FAILED:")
        for item in failures:
            print(f"  - {item['check']}: {item['expected']} (status={item['status']}, detail={str(item['detail'])[:200]})")
    print(f"evidence -> {os.path.relpath(REPORT_PATH, ROOT)}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
