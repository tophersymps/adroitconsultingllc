#!/usr/bin/env python3
"""Verify Supabase tables were created on the remote project."""
import json
import urllib.request
import urllib.error

env_path = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.env.local"
with open(env_path, 'r') as f:
    anon_key = ""
    for line in f:
        if 'SUPABASE_ANON_KEY' in line:
            anon_key = line.split('=', 1)[1].strip()
            break

if not anon_key or '...' in anon_key:
    print("WARNING: SUPABASE_ANON_KEY appears truncated in .env.local")
    print(f"  Current value: {anon_key[:40]}...")
    print("  Please verify the key is complete before testing API access.")
    exit(1)

url = "https://zrggxfdyptiahskogwnn.supabase.co/rest/v1/tables?select=table_schema,table_name"
req = urllib.request.Request(url, headers={
    "apikey": anon_key,
    "Authorization": f"Bearer {anon_key}",
    "Content-Type": "application/json"
})

try:
    with urllib.request.urlopen(req) as resp:
        tables = json.loads(resp.read())
        print(f"Tables found: {len(tables)}")
        for t in tables:
            print(f"  - {t['table_schema']}.{t['table_name']}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.reason}")
    print("The anon key may be invalid or tables may not exist yet.")
