#!/usr/bin/env python3
"""Inspect TURBOPACK chunk structure: how a chunk references another chunk."""
import os, re

base = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
files = [f for f in os.listdir(base) if f.endswith(".js")]

def read(f):
    return open(os.path.join(base, f), encoding="utf-8", errors="ignore").read()

# Find the chunk containing ProfileGalaxy3D (the public entry that does dynamic import)
for f in files:
    src = read(f)
    if "ProfileGalaxy3D" in src and "Materializing your galaxy" in src:
        print(f"=== ProfileGalaxy3D entry chunk: {f} ({os.path.getsize(os.path.join(base,f))/1024:.1f} KB) ===")
        # Show the head structure (first 800 chars)
        print(read(f)[:800])
        print("\n--- dynamic import markers ---")
        for m in re.finditer(r'.{30}(import\(|dynamic|\.then\().{60}', read(f)):
            print(repr(m.group(0)))
        break
