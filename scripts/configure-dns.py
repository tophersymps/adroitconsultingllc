#!/usr/bin/env python3
"""Configure DNS for adroit.io on Vercel.

This script adds DNS records to Vercel so the domain can serve traffic.
Correct endpoint: POST /v3/domains/{domain}/records
"""

import json
import http.client
from pathlib import Path

DOMAIN = "adroit.io"
TEAM_ID = "team_jWHucuFAIvzoqa03iy48ur7I"

def get_token():
    auth = Path.home() / "Library" / "Application Support" / "com.vercel.cli" / "auth.json"
    if auth.exists():
        with open(auth) as f:
            return json.load(f).get("token", "")
    return ""

def vercel_api(method, path, body=None):
    token = get_token()
    if not token:
        print("ERROR: No token found")
        return None
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "adroit-blog-deploy",
        "X-Vercel-Team-Id": TEAM_ID,
    }
    
    conn = http.client.HTTPSConnection("api.vercel.com")
    body_bytes = json.dumps(body).encode() if body else None
    conn.request(method, path, body=body_bytes, headers=headers)
    resp = conn.getresponse()
    result = {"status": resp.status, "body": json.loads(resp.read().decode())}
    conn.close()
    return result

def main():
    # Add A record for apex domain
    print("=== Adding A record (adroit.io -> 76.76.21.21) ===")
    resp = vercel_api("POST", f"/v3/domains/{DOMAIN}/records", body={
        "name": "",
        "type": "A",
        "value": "76.76.21.21"
    })
    print(f"Status: {resp['status']}")
    print(f"Response: {json.dumps(resp['body'], indent=2)[:1000]}")
    
    # Add CNAME record for www
    print("\n=== Adding CNAME record (www -> cname.vercel-dns.com) ===")
    resp = vercel_api("POST", f"/v3/domains/{DOMAIN}/records", body={
        "name": "www",
        "type": "CNAME",
        "value": "cname.vercel-dns.com"
    })
    print(f"Status: {resp['status']}")
    print(f"Response: {json.dumps(resp['body'], indent=2)[:1000]}")
    
    # Add TXT record for verification
    print("\n=== Adding TXT record (verification) ===")
    resp = vercel_api("POST", f"/v3/domains/{DOMAIN}/records", body={
        "name": "_vercel",
        "type": "TXT",
        "value": "vc-domain-verify=adroit.io,ddaf1bef3c72babd42d9"
    })
    print(f"Status: {resp['status']}")
    print(f"Response: {json.dumps(resp['body'], indent=2)[:1000]}")

if __name__ == "__main__":
    main()
