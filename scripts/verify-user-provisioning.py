#!/usr/bin/env python3
"""verify-user-provisioning.py — prove public."user" provisioning works.

Task t_749fcf79. Companion to supabase/migrations/neon/002_provision_public_user.sql.

Three layers of proof, in order:

  1. FUNCTION (unit, SQL) — public.provision_public_user() copies a
     neon_auth."user" identity into public."user" with the right values,
     fills `provider` from neon_auth.account, and is idempotent: deleting the
     mirror and calling it twice leaves exactly one row with no NULLs in the
     NOT-NULL columns. Runs inside one transaction that is ROLLED BACK, so it
     cannot damage the fixtures.

  2. EAGER (integration, HTTP) — a genuinely new Managed Better Auth sign-up
     has its public."user" row *before* the first Data API write, and that
     write (POST /lesson_completion) returns 2xx with only the new user's JWT.
     This is the bug R1-5 measured (23503). The eager path is also where
     `provider` must still be NULL for an email+password sign-up (see F1 in
     task t_de36d259); 'credential' is only written by a later re-provision,
     which layer 1 asserts.

  3. LAZY HEAL (integration, HTTP) — delete the mirror row (the exact state
     R1-5's fresh-signup probe creates), then POST /lesson_completion again:
     the BEFORE INSERT trigger must re-provision and the write must be 2xx.
     Finally confirm cross-user isolation still holds afterwards.

Endpoints and the database URL come from the environment / the repo's
.env.local; nothing secret is printed or written.

Usage:
  QA_PROVISION_PASSWORD=... python3 scripts/verify-user-provisioning.py [--email ...] \
      [--allow-live-db [--allow-production-db]]
  (or pass --password; the script refuses to run without one — no built-in default)

Database guard (security audit F6, task t_9aba2d2e): this harness INSERTs an
admin row into public.user_roles and DELETEs identities, so it refuses to run
against any non-local database unless --allow-live-db is passed, and against the
PRODUCTION Neon endpoint unless --allow-production-db is passed as well. See
scripts/live_db_guard.py. Exit 2 = configuration error (including a refused
target), the same contract the script already used for missing config.
Exit 0 = all checks pass. Exit 1 = a check failed (printed as FAIL).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_db_guard import add_guard_arguments, require_safe_db_target  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_AUTH_HOST = "ep-noisy-glade-b7jpeudp.neonauth.c-13.us-east-1.aws.neon.tech"
AUTH_BASE_PATH = "/neondb/auth"  # Managed Better Auth base URL is <host>/neondb/auth
DEFAULT_DATA_HOST = "ep-noisy-glade-b7jpeudp.apirest.c-13.us-east-1.aws.neon.tech"
DATA_BASE_PATH = "/neondb/rest/v1"  # Neon Data API base URL is <host>/neondb/rest/v1
DEFAULT_EMAIL = "kelex1812+qa-provision-a@gmail.com"
OTHER_EMAIL = "kelex1812+qa-provision-b@gmail.com"
ORIGIN = "https://adroit.io"
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

RESULTS: list[dict] = []


# --------------------------------------------------------------------------
# plumbing
# --------------------------------------------------------------------------


def record(check: str, ok: bool, *, expected: str, detail=None) -> None:
    RESULTS.append({"check": check, "ok": ok, "expected": expected,
                    "detail": _scrub(detail)})
    print(f"  [{'PASS' if ok else 'FAIL'}] {check:<52} {'' if ok else '<<< ' + expected}")
    if detail is not None:
        print(f"         {json.dumps(_scrub(detail), default=str)[:400]}")


def _scrub(value):
    if isinstance(value, dict):
        return {k: (f"«redacted:{len(v)}chars»" if k.lower() == "token" and isinstance(v, str) else _scrub(v))
                for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def http(method: str, url: str, *, token: str | None = None, body=None, headers=None):
    data = None
    hdrs = {"Origin": ORIGIN, "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
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
        return raw[:400]


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


def sql(query: str, *, db_url: str) -> str:
    proc = subprocess.run(
        ["psql", db_url, "-X", "-q", "-A", "-F", "\t", "-t", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"psql failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def auth_headers(headers) -> str:
    return "; ".join(value.split(";")[0] for key, value in headers.items()
                     if key.lower() == "set-cookie")


def sign_up_or_in(auth_url: str, email: str, password: str):
    """Returns (token, user_id, created). Creates the account if unknown."""
    status, body, headers = http("POST", f"{auth_url}/sign-in/email",
                                 body={"email": email, "password": password})
    created = False
    if status != 200:
        status, body, _ = http("POST", f"{auth_url}/sign-up/email",
                               body={"email": email, "password": password, "name": f"QA provisioning {email}"})
        if status not in (200, 201):
            raise SystemExit(f"cannot create {email}: HTTP {status} {str(body)[:300]}")
        created = True
        status, body, headers = http("POST", f"{auth_url}/sign-in/email",
                                     body={"email": email, "password": password})
        if status != 200:
            raise SystemExit(f"cannot sign in {email}: HTTP {status} {str(body)[:300]}")
    status, body2, _ = http("GET", f"{auth_url}/token", headers={"Cookie": auth_headers(headers)})
    if status != 200 or not isinstance(body2, dict) or "token" not in body2:
        raise SystemExit(f"cannot fetch token for {email}: HTTP {status} {str(body2)[:300]}")
    payload = body2["token"].split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload.replace("-", "+").replace("_", "/")))
    return body2["token"], claims["sub"], created


# --------------------------------------------------------------------------
# 1. function-level proof (rolled back)
# --------------------------------------------------------------------------


def check_function(db_url: str, user_id: str) -> None:
    print("\n== 1. provisioning function (unit, rolled back)")
    if not UUID_RE.match(user_id):
        raise SystemExit(f"refusing non-uuid id {user_id!r}")

    script = f"""
    BEGIN;
    DELETE FROM public."user" WHERE id = '{user_id}';
    SELECT 'AFTER_DELETE=' || count(*) FROM public."user" WHERE id = '{user_id}';
    SELECT public.provision_public_user('{user_id}');
    SELECT public.provision_public_user('{user_id}');   -- idempotent
    SELECT 'AFTER=' || count(*) || '|' || bool_and(name IS NOT NULL AND name <> '' AND email IS NOT NULL
                    AND emailverified IS NOT NULL AND createdat IS NOT NULL
                    AND updatedat IS NOT NULL)
           || '|' || (max(email) = (SELECT email FROM neon_auth."user" WHERE id = '{user_id}'))
           || '|' || (max(name)  = (SELECT coalesce(nullif(name, ''), email) FROM neon_auth."user" WHERE id = '{user_id}'))
           || '|' || (max(provider) IS NOT NULL)
      FROM public."user" WHERE id = '{user_id}';
    SELECT public.provision_public_user(gen_random_uuid());   -- unknown id: no-op, no raise
    ROLLBACK;
    """
    proc = subprocess.run(["psql", db_url, "-X", "-q", "-A", "-F", "|", "-t",
                           "-v", "ON_ERROR_STOP=1"],
                          input=script, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        record("function.runs", False, expected="psql exit 0", detail=proc.stderr.strip()[-500:])
        return
    out = {}
    for line in proc.stdout.splitlines():
        if line.startswith("AFTER_DELETE="):
            out["after_delete"] = line.split("=", 1)[1].strip()
        elif line.startswith("AFTER="):
            out["after"] = line.split("=", 1)[1].strip().split("|")
    record("function.runs", "after" in out, expected="psql exit 0 with both probes",
           detail={"after_delete": out.get("after_delete"), "after": out.get("after")})

    record("function.creates_row", out.get("after_delete") == "0",
           expected="0 rows after delete (provision is what creates it)",
           detail={"count": out.get("after_delete")})

    flags = out.get("after") or []
    row_count = flags[0] if flags else ""
    record("function.idempotent", row_count == "1", expected="1 row after two calls",
           detail={"rows": row_count})
    record("function.not_null_columns_filled", len(flags) > 1 and flags[1] in ("t", "true"),
           expected="name/email/emailverified/createdat/updatedat all set", detail={"flags": flags})
    record("function.email_copied", len(flags) > 2 and flags[2] in ("t", "true"),
           expected="email matches neon_auth.\"user\"")
    record("function.name_copied", len(flags) > 3 and flags[3] in ("t", "true"),
           expected="name matches neon_auth.\"user\" (or email fallback)")
    record("function.provider_copied", len(flags) > 4 and flags[4] in ("t", "true"),
           expected="provider identity filled from neon_auth.account", detail={"flags": flags})


# --------------------------------------------------------------------------
# 2 + 3. HTTP proof
# --------------------------------------------------------------------------


def check_write(data_url: str, token: str, user_id: str, path: str, body: dict, *,
                method: str = "POST", ok_status=(200, 201, 204), upsert: bool = False):
    prefer = "return=representation"
    if upsert:
        prefer += ",resolution=merge-duplicates"
    status, resp, _ = http(method, f"{data_url}{path}", token=token, body=body,
                           headers={"Prefer": prefer})
    ok = status in ok_status
    record(f"http.{method.lower()}.{path.split('?')[0].lstrip('/')}", ok,
           expected=f"{ok_status}: write accepted", detail={"status": status, "body": resp})
    return status, resp


def check_eager(auth_url: str, data_url: str, db_url: str, token: str, user_id: str, created: bool):
    print("\n== 2. eager provisioning (real sign-up)")
    record("auth.account", bool(user_id) and created,
           expected="a genuinely new auth account created this run and returned an id",
           detail={"user_id": user_id, "created_this_run": created})

    mirror = sql(f'SELECT id FROM public."user" WHERE id = \'{user_id}\';', db_url=db_url)
    record("eager.mirror_row_exists", mirror.strip() == user_id,
           expected='public."user" row exists immediately after sign-up (eager trigger)',
           detail={"user_id": user_id, "mirror": mirror.strip() or None})

    if mirror.strip() != user_id:
        # heal so the rest of the run still measures the write path
        sql(f"SELECT public.provision_public_user('{user_id}');", db_url=db_url)

    fields = sql(
        f'SELECT email, name, coalesce(provider, \'<NULL>\') '
        f'FROM public."user" WHERE id = \'{user_id}\';',
        db_url=db_url).split("\t")
    auth_email = sql(f'SELECT email FROM neon_auth."user" WHERE id = \'{user_id}\';', db_url=db_url)
    record("eager.email_copied", bool(fields) and fields[0].strip().lower() == auth_email.strip().lower(),
           expected="email matches the auth identity", detail={"fields": fields})

    # F1 (t_de36d259, decision B): an email+password sign-up carries no
    # provider *identity*, and the neon_auth.account trigger deliberately
    # skips providerId='credential' (002 §3), so the eager path MUST leave
    # provider NULL. 'credential' only appears if the same id is
    # re-provisioned later - that is what function.provider_copied proves.
    actual_provider = fields[2].strip() if len(fields) > 2 else ""
    provider_null = actual_provider == "<NULL>"
    record("eager.provider_null_for_credential", provider_null,
           expected="provider IS NULL for a fresh email+password sign-up",
           detail={"provider": None if provider_null else actual_provider,
                   "LHS": auth_email.strip(),
                   "decision": "B - NULL at sign-up, credential only after a re-provision"})

    # The R1-5 failure: 409/23503 on the very first write.
    check_write(data_url, token, user_id, "/lesson_completion",
                {"user_id": user_id, "lesson_slug": "qa-provision-eager"})

    # read_progress upsert
    status, _ = check_write(data_url, token, user_id, "/read_progress?on_conflict=user_id,content_slug",
                            {"user_id": user_id, "content_type": "lesson", "content_slug": "qa-provision-eager"},
                            ok_status=(200, 201), upsert=True)
    if status in (200, 201):
        check_write(data_url, token, user_id, "/read_progress?on_conflict=user_id,content_slug",
                    {"user_id": user_id, "content_type": "lesson", "content_slug": "qa-provision-eager"},
                    ok_status=(200, 201), upsert=True)

    # user_profiles
    check_write(data_url, token, user_id, "/user_profiles?on_conflict=user_id",
                {"user_id": user_id, "display_name": "QA provisioning"}, ok_status=(200, 201), upsert=True)

    # quiz_attempt is server-write-only BY DESIGN (migration 006). Provisioning
    # must change the failure from 409/23503 (missing FK parent) to 403 (RLS).
    status, resp = check_write(data_url, token, user_id, "/quiz_attempt",
                               {"user_id": user_id, "quiz_name": "qa-provision", "question_index": 0,
                                "correct_answer_index": 1, "user_answer_index": 1, "is_correct": True},
                               ok_status=(401, 403))
    code = resp.get("code") if isinstance(resp, dict) else None
    record("quiz_attempt.denied_by_rls_not_fk", status in (401, 403) and str(code) != "23503",
           expected="403 RLS (server-write-only by design), never 23503 FK",
           detail={"status": status, "code": code})
    return token, user_id, created


def check_lazy(data_url: str, db_url: str, token: str, user_id: str):
    print("\n== 3. lazy heal (mirror deleted, as R1-5's probe does)")
    sql(f'DELETE FROM public."user" WHERE id = \'{user_id}\';', db_url=db_url)
    gone = sql(f'SELECT count(*) FROM public."user" WHERE id = \'{user_id}\';', db_url=db_url)
    record("lazy.mirror_deleted", gone.strip() == "0", expected="0 rows after delete",
           detail={"count": gone.strip()})

    check_write(data_url, token, user_id, "/lesson_completion",
                {"user_id": user_id, "lesson_slug": "qa-provision-lazy"})

    healed = sql(f'SELECT id FROM public."user" WHERE id = \'{user_id}\';', db_url=db_url)
    record("lazy.mirror_reprovisioned", healed.strip() == user_id,
           expected="BEFORE INSERT trigger re-created public.\"user\" row", detail={"mirror": healed.strip() or None})


def check_isolation(data_url: str, auth_url: str, db_url: str, token_a: str, user_a: str,
                    email_b: str, password: str):
    print("\n== 4. isolation still holds")
    token_b, user_b, _ = sign_up_or_in(auth_url, email_b, password)
    if user_b == user_a:
        record("isolation.distinct_users", False, expected="two distinct users")
        return

    # B's row exists (eager) — then A must not be able to read it
    status, rows, _ = http("GET", f"{data_url}/lesson_completion?select=user_id&user_id=eq.{user_b}",
                           token=token_a)
    record("isolation.cross_user_read", status == 200 and isinstance(rows, list) and len(rows) == 0,
           expected="0 rows of another user's progress", detail={"status": status, "rows": rows})

    status, resp, _ = http("POST", f"{data_url}/lesson_completion", token=token_a,
                           body={"user_id": user_b, "lesson_slug": "qa-provision-cross"},
                           headers={"Prefer": "return=representation"})
    record("isolation.cross_user_write_denied", status in (401, 403),
           expected="401/403 for a write to another user's id", detail={"status": status, "body": resp})

    # the provisioning function is not reachable as a client RPC
    status, resp, _ = http("POST", f"{data_url}/rpc/provision_public_user", token=token_a,
                           body={"p_user_id": user_b})
    record("isolation.rpc_not_exposed", status in (400, 401, 403, 404),
           expected="provision function not callable over the Data API",
           detail={"status": status, "body": resp})


# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="fresh QA account A")
    parser.add_argument("--email-b", default=OTHER_EMAIL, help="second QA account (isolation)")
    parser.add_argument("--password", default=None,
                        help="QA account password; falls back to $QA_PROVISION_PASSWORD "
                             "(there is deliberately no built-in default)")
    parser.add_argument("--auth-url", default=os.environ.get("NEON_AUTH_BASE_URL",
                                                             f"https://{DEFAULT_AUTH_HOST}{AUTH_BASE_PATH}"))
    parser.add_argument("--data-url", default=os.environ.get("NEON_DATA_API_URL",
                                                             f"https://{DEFAULT_DATA_HOST}{DATA_BASE_PATH}"))
    parser.add_argument("--report", default=os.path.join(ROOT, "reports",
                                                         "user-provisioning-evidence.json"))
    add_guard_arguments(parser)
    args = parser.parse_args()

    load_dotenv()
    # Resolved after load_dotenv() so .env.local counts. No constant fallback:
    # this script creates/signs in to live auth accounts and the repo is public.
    password = args.password or os.environ.get("QA_PROVISION_PASSWORD")
    if not password:
        raise SystemExit("--password or QA_PROVISION_PASSWORD is required "
                         "(no built-in default; export a throwaway QA password first)")
    db_url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL_UNPOOLED (or DATABASE_URL) is required")
    # Security audit F6 (t_9aba2d2e): this harness INSERTs an admin role row
    # and DELETEs identities, and DATABASE_URL_UNPOOLED in .env.local is the
    # production endpoint. Refuse anything that was not explicitly opted into.
    db_host = require_safe_db_target(db_url, allow_live_db=args.allow_live_db,
                                     allow_production_db=args.allow_production_db)
    auth_url = args.auth_url.rstrip("/")
    data_url = args.data_url.rstrip("/")

    print(f"auth={auth_url.split('//')[-1].split('/')[0]}  data={data_url.split('//')[-1].split('/')[0]}"
          f"  db={db_host}")

    # A brand-new identity per run is the point of the eager check: reusing an
    # account would only re-test the lazy heal path.
    email_a = args.email
    if email_a == DEFAULT_EMAIL:
        email_a = f"kelex1812+qa-provision-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}@gmail.com"

    token, user_id, created = sign_up_or_in(auth_url, email_a, password)
    print(f"qa user A = {user_id} ({email_a}, created_this_run={created})")

    check_eager(auth_url, data_url, db_url, token, user_id, created)
    check_function(db_url, user_id)
    check_lazy(data_url, db_url, token, user_id)
    check_isolation(data_url, auth_url, db_url, token, user_id, args.email_b, password)

    passed = sum(1 for r in RESULTS if r["ok"])
    failed = [r["check"] for r in RESULTS if not r["ok"]]
    verdict = "PASS" if not failed else "FAIL"
    print(f"\n{verdict} ({passed}/{len(RESULTS)} assertions)" + (f" failed: {failed}" if failed else ""))

    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as handle:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(),
                   "auth_host": auth_url.split("//")[-1].split("/")[0],
                   "data_host": data_url.split("//")[-1].split("/")[0],
                   "assertions_total": len(RESULTS),
                   "assertions_passed": passed,
                   "verdict": verdict,
                   "results": RESULTS}, handle, indent=2)
    print(f"evidence: {args.report}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
