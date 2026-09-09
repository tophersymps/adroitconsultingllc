#!/usr/bin/env python3
"""Add adroit.io domain to the Vercel project via the API."""

import json
import http.client
from pathlib import Path

PROJECT_ID = "prj_VXCz3FXZgx7jLxsPfdWIOhpFKsaG"
DOMAIN = "adroit.io"
TEAM_ID = "team_jWHucuFAIvzoqa03iy48ur7I"

def get_token():
    auth = Path.home() / "Library" / "Application Support" / "com.vercel.cli" / "auth.json"
    if auth.exists():
        with open(auth) as f:
            return json.load(f).get("token", "")
    return ""

def vercel_api(method, path, body=None, team=True):
    """Call Vercel API on api.vercel.com."""
    token = get_token()
    if not token:
        print("ERROR: No token found")
        return None
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "adroit-blog-deploy",
    }
    
    if team:
        headers["X-Vercel-Team-Id"] = TEAM_ID
    
    conn = http.client.HTTPSConnection("api.vercel.com")
    conn.request(method, path, body=json.dumps(body).encode() if body else None, headers=headers)
    resp = conn.getresponse()
    result = {"status": resp.status, "body": json.loads(resp.read().decode())}
    conn.close()
    return result

def main():
    # First, check current domains on the project
    print("=== Listing project domains ===")
    resp = vercel_api("GET", f"/v2/projects/{PROJECT_ID}/domains")
    print(f"Status: {resp['status']}")
    print(f"Response: {json.dumps(resp['body'], indent=2)[:2000]}")
    
    # Add the domain
    print("\n=== Adding domain ===")
    resp2 = vercel_api("POST", f"/v10/projects/{PROJECT_ID}/domains", body={"name": DOMAIN})
    print(f"Status: {resp2['status']}")
    print(f"Response: {json.dumps(resp2['body'], indent=2)[:2000]}")

if __name__ == "__main__":
    main()
