#!/usr/bin/env python3
"""live_db_guard.py — keep QA harnesses from mutating a live database by accident.

Security audit F6 (task t_9aba2d2e). `scripts/verify-session-bridge.py` and
`scripts/verify-user-provisioning.py` are *destructive* integration harnesses:
they `INSERT` an `admin` row into `public.user_roles`, write product rows, and
`DELETE` whole identities from `public."user"` and `neon_auth.*`. They reach
Postgres through `DATABASE_URL_UNPOOLED`, and in this repo's `.env.local` that
variable points at the **production** unpooled endpoint — so a plain
`python3 scripts/verify-session-bridge.py` used to run its INSERT/DELETE
sequence against live customer data. That is exactly how the leftover QA
fixture identities (one holding `role = admin`) were minted.

This module makes the safe thing the default:

  * loopback / unix-socket targets      -> allowed, no flag needed (a Neon
    branch or a local Postgres is where these scripts belong)
  * any other host (a Neon branch, a
    preview database, staging)          -> requires ``--allow-live-db``
  * the production unpooled/pooler host -> refused even with
    ``--allow-live-db``; it needs the second, deliberately separate opt-in
    ``--allow-production-db``

The two-flag split is the point: one flag is "yes, this really is a live
database, not my laptop", the second is "and I mean production, with the
customer rows in it". Copy-pasting a single flag from a previous run no longer
gets anyone into prod.

Usage from a harness's ``main()``::

    from live_db_guard import add_guard_arguments, require_safe_db_target
    add_guard_arguments(parser)          # adds --allow-live-db/--allow-production-db
    ...
    require_safe_db_target(db_url, allow_live_db=args.allow_live_db,
                           allow_production_db=args.allow_production_db)

Exit code 2 (configuration error, matching both harnesses' existing contract)
with a one-line explanation on stderr when the guard refuses.

Module self-test: ``python3 scripts/live_db_guard.py`` prints the decision
matrix and exits 0 when every case matches.
"""

from __future__ import annotations

import argparse
import sys
from urllib.parse import urlsplit

# The live adroit Neon project (project dawn-darkness-89797362, branch
# `production`): the direct endpoint and its pooler. Both are refused unless
# --allow-production-db is passed on top of --allow-live-db.
PRODUCTION_HOSTS = frozenset({
    "ep-noisy-glade-b7jpeudp.c-13.us-east-1.aws.neon.tech",
    "ep-noisy-glade-b7jpeudp-pooler.c-13.us-east-1.aws.neon.tech",
})

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", ""})


class LiveDbRefused(SystemExit):
    """Raised (as SystemExit) when the target database is not opt-in-safe."""

    def __init__(self, message: str) -> None:
        self.message = message
        print(f"live-db-guard: {message}", file=sys.stderr)
        super().__init__(2)


def add_guard_arguments(parser: argparse.ArgumentParser) -> None:
    """Register the two opt-in flags every destructive harness needs."""
    parser.add_argument(
        "--allow-live-db", action="store_true",
        help="allow the destructive checks to run against a non-local database "
             "(required for any Neon branch/preview/staging host)")
    parser.add_argument(
        "--allow-production-db", action="store_true",
        help="additionally allow the PRODUCTION Neon endpoint; only meaningful "
             "together with --allow-live-db, and only for a deliberate, "
             "supervised run")


def db_host(db_url: str) -> str:
    """Lower-cased host component of a postgres DSN (empty for unix sockets)."""
    if not db_url:
        return ""
    if db_url.startswith("/"):
        return ""  # unix socket directory
    parts = urlsplit(db_url if "//" in db_url else f"//{db_url}")
    return (parts.hostname or "").lower()


def is_production_host(db_url: str) -> bool:
    return db_host(db_url) in PRODUCTION_HOSTS


def is_local_host(db_url: str) -> bool:
    return db_host(db_url) in LOCAL_HOSTS


def require_safe_db_target(db_url: str, *, allow_live_db: bool,
                           allow_production_db: bool = False) -> str:
    """Return the target host, or exit(2) with the reason it was refused."""
    host = db_host(db_url)
    shown = host or "<unix socket>"

    if host in PRODUCTION_HOSTS and not (allow_live_db and allow_production_db):
        missing = "--allow-live-db --allow-production-db" if not allow_live_db \
            else "--allow-production-db"
        raise LiveDbRefused(
            f"refusing to run against the PRODUCTION database ({shown}): this "
            f"harness INSERTs admin rows and DELETEs identities. Point "
            f"DATABASE_URL_UNPOOLED at a Neon branch, or pass {missing} for a "
            f"deliberate production run.")
    if host not in LOCAL_HOSTS and not allow_live_db:
        raise LiveDbRefused(
            f"refusing to run against a non-local database ({shown}): this "
            f"harness INSERTs admin rows and DELETEs identities. Pass "
            f"--allow-live-db if that host is a disposable Neon branch.")
    return shown


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------

PROD = "postgresql://u:p@ep-noisy-glade-b7jpeudp.c-13.us-east-1.aws.neon.tech/neondb"
PROD_POOLER = "postgresql://u:p@ep-noisy-glade-b7jpeudp-pooler.c-13.us-east-1.aws.neon.tech/neondb"
BRANCH = "postgresql://u:p@ep-cool-branch-123456.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require"
LOCAL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
LHOST = "postgresql://postgres@localhost/postgres"
SOCKET = "postgresql:///postgres?host=/tmp"

CASES = [
    # (name, url, allow_live, allow_prod, expect_ok)
    ("local loopback, no flags", LOCAL, False, False, True),
    ("localhost, no flags", LHOST, False, False, True),
    ("unix socket, no flags", SOCKET, False, False, True),
    ("neon branch, no flags", BRANCH, False, False, False),
    ("neon branch, --allow-live-db", BRANCH, True, False, True),
    ("production unpooled, no flags", PROD, False, False, False),
    ("production unpooled, --allow-live-db only", PROD, True, False, False),
    ("production unpooled, both flags", PROD, True, True, True),
    ("production pooler, --allow-live-db only", PROD_POOLER, True, False, False),
    ("production pooler, both flags", PROD_POOLER, True, True, True),
]


def _self_test() -> int:
    failures = 0
    for name, url, live, prod, expect_ok in CASES:
        try:
            require_safe_db_target(url, allow_live_db=live, allow_production_db=prod)
            ok, detail = True, "allowed"
        except LiveDbRefused as exc:
            ok, detail = False, f"refused (exit {exc.code}): {exc.message[:90]}"
        verdict = "PASS" if ok == expect_ok else "FAIL"
        if ok != expect_ok:
            failures += 1
        print(f"  [{verdict}] {name:<44} {detail}")
    total = len(CASES)
    print(f"\n{'PASS' if not failures else 'FAIL'} ({total - failures}/{total} guard cases)")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(_self_test())
