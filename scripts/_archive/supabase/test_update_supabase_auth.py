#!/usr/bin/env python3
"""Unit-ish checks for scripts/update-supabase-auth.py fail-closed behaviour.

Tests (run from repo root):
  1. No SUPABASE_SERVICE_ROLE_KEY  -> exit 1, "not set"
  2. Truncated key                 -> exit 1, "truncated"
  3. Anon-looking key (role=anon)  -> exit 1, "service_role claim"
  4. Valid service_role key (mocked, no network) -> proceeds to URL call
"""
import base64
import json
import os
import subprocess
import sys

REPO = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog"
SCRIPT = os.path.join(REPO, "scripts", "update-supabase-auth.py")


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(role: str) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({"role": role, "iss": "test"}).encode())
    sig = b64url(b"fake-signature")
    return f"{header}.{payload}.{sig}"


def run(key_env: dict, expected_rc: int, needle: str, label: str) -> bool:
    env = dict(os.environ)
    env.pop("SUPABASE_SERVICE_ROLE_KEY", None)
    env.update(key_env)
    proc = subprocess.run(
        [sys.executable, SCRIPT],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    ok = proc.returncode == expected_rc and needle in (proc.stdout + proc.stderr)
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label}: rc={proc.returncode} (want {expected_rc})")
    if not ok:
        print("  stdout:", proc.stdout[-300:])
        print("  stderr:", proc.stderr[-300:])
    return ok


results = [
    run({}, 1, "not set", "missing key fails closed"),
    run({"SUPABASE_SERVICE_ROLE_KEY": "eyJ...truncated..."}, 1, "truncated", "truncated key fails closed"),
    run({"SUPABASE_SERVICE_ROLE_KEY": make_jwt("anon")}, 1, "service_role", "anon key fails closed"),
]

# Case 4: valid service_role JWT should pass validation and attempt the network
# call. We do NOT want a real network call, so point SUPABASE_URL at localhost
# and expect a connection error (proves it got past validation).
env = dict(os.environ)
env["SUPABASE_SERVICE_ROLE_KEY"] = make_jwt("service_role")
env["SUPABASE_URL"] = "http://127.0.0.1:1"
proc = subprocess.run(
    [sys.executable, SCRIPT],
    env=env,
    capture_output=True,
    text=True,
    timeout=30,
)
# Should get past validation -> connection refused / HTTP error, NOT the
# fail-closed messages.
passed_val = "service_role claim" not in (proc.stdout + proc.stderr)
print(f"[{'PASS' if passed_val else 'FAIL'}] valid service_role key passes validation (rc={proc.returncode})")
if not passed_val:
    print("  stdout:", proc.stdout[-300:])
    print("  stderr:", proc.stderr[-300:])
results.append(passed_val)

sys.exit(0 if all(results) else 1)
