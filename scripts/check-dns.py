#!/usr/bin/env python3
"""Configure DNS for adroit.io on the Vercel project.

After running add-domain-via-api.py, this script checks DNS verification
and logs the required DNS records for the domain.

Required DNS records (on your DNS provider):
1. TXT: _vercel.adroit.io = vc-domain-verify=adroit.io,<VERIFICATION_CODE>
2. A record: adroit.io → 76.76.21.21 (or CNAME to cname.vercel-dns.com)
"""

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

def main():
    token = get_token()
    if not token:
        print("ERROR: No token found")
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "adroit-blog-deploy",
        "X-Vercel-Team-Id": TEAM_ID,
    }

    # Check domain verification status
    conn = http.client.HTTPSConnection("api.vercel.com")
    conn.request("GET", f"/v10/projects/{PROJECT_ID}/domains/{DOMAIN}", headers=headers)
    resp = conn.getresponse()
    data = json.loads(resp.read().decode())
    
    print(f"\n=== Domain Status for {DOMAIN} ===")
    print(f"Verified: {data.get('verified', 'unknown')}")
    print(f"Created: {data.get('createdAt', 'N/A')}")
    print(f"Project: {data.get('projectId', 'N/A')}")
    
    if not data.get('verified', True):
        verification = data.get('verification', [])
        for v in verification:
            if v.get('type') == 'TXT':
                print(f"\n=== DNS Verification Required ===")
                print(f"Record Type: TXT")
                print(f"Host: {v['domain']}")
                print(f"Value: {v['value']}")
                print(f"\nAdd this TXT record to your DNS provider (e.g., Cloudflare, Route53):")
                print(f'  {v["domain"]} → "{v["value"]}"')
    
    print(f"\n=== Additional DNS Records Needed ===")
    print(f"For actual hosting, configure on your DNS provider:")
    print(f"  A record: adroit.io → 76.76.21.21")
    print(f"  Or CNAME: adroit.io → cname.vercel-dns.com")

if __name__ == "__main__":
    main()
