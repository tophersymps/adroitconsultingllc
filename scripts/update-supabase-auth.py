#!/usr/bin/env python3
"""Update Supabase auth settings via the GoTrue Admin API.

Requires a real admin credential — the `service_role` key — supplied via
environment variable ONLY. Never store keys in tracked files.

  SUPABASE_SERVICE_ROLE_KEY   The project's service_role key (JWT with the
                              `service_role` claim). Required for admin
                              endpoints like /auth/v1/admin/settings.

The script FAILS CLOSED: if the key is missing, looks truncated, or is an
anon/public key (JWT `role` claim is not `service_role`), it exits without
making any request.

Security note (audit t_4ee14a75 F1): the anon key CANNOT be used for admin
endpoints — it is a client-side, RLS-scoped key. Sending it to an admin
endpoint previously produced a false sense of security and normalised
treating app-level keys as admin credentials.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Optional

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zrggxfdyptiahskogwnn.supabase.co")


def _looks_truncated(key: str) -> bool:
    """Heuristic for a key that was cut off mid-value."""
    return "..." in key or len(key) < 40


def _jwt_role(key: str) -> Optional[str]:
    """Decode the `role` claim from a Supabase JWT (anon/service_role keys)."""
    try:
        payload_b64 = key.split(".")[1]
        # Add padding back for base64url decoding
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        return payload.get("role")
    except Exception:
        return None


def load_service_role_key() -> str:
    """Load the service_role key from the environment, failing closed."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not key:
        print(
            "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.\n"
            "Export the project's service_role key in the environment, e.g.:\n"
            "  export SUPABASE_SERVICE_ROLE_KEY='<service_role_key>'\n"
            "Do NOT put the key in a tracked file.",
            file=sys.stderr,
        )
        sys.exit(1)

    if _looks_truncated(key):
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY appears truncated.", file=sys.stderr)
        sys.exit(1)

    role = _jwt_role(key)
    if role != "service_role":
        print(
            "ERROR: SUPABASE_SERVICE_ROLE_KEY does not carry the service_role "
            "claim (got role={!r}). Refusing to call the admin endpoint with a "
            "non-admin key. The anon key is NOT valid for admin endpoints."
            .format(role),
            file=sys.stderr,
        )
        sys.exit(1)

    return key


def main() -> None:
    service_role_key = load_service_role_key()

    # GoTrue Admin API — requires a service_role JWT, NOT the anon key.
    url = f"{SUPABASE_URL}/auth/v1/admin/settings"
    payload = json.dumps({
        "site_url": "https://adroit.io",
        "additional_redirect_urls": [
            "https://adroit.io",
            "https://www.adroit.io",
            "https://adroit-blog.vercel.app",
            "http://localhost:3000",
        ],
        "enable_signup": True,
        "enable_confirmations": True,
        "jwt_expiry": 3600,
        "enable_refresh_token_rotation": True,
        "refresh_token_reuse_interval": 10,
        "minimum_password_length": 6,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        method="PATCH",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print("Auth config updated successfully:")
            print(json.dumps(result, indent=2))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        try:
            print(json.loads(e.read()))
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
