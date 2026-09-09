#!/usr/bin/env python3
"""Perf chunk audit: which chunks reference three, and which page entries pull them."""
import os, re, json

base = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
files = [f for f in os.listdir(base) if f.endswith(".js")]

# 1) Identify chunks that reference three / react-three
three_chunks = []
for f in files:
    p = os.path.join(base, f)
    try:
        src = open(p, encoding="utf-8", errors="ignore").read()
    except Exception:
        continue
    if "react-three" in src or "THREE." in src or "three@" in src:
        three_chunks.append((f, os.path.getsize(p)))

print("=== chunks referencing three (size KB) ===")
for f, sz in sorted(three_chunks, key=lambda x: -x[1]):
    print(f"{sz/1024:8.1f}  {f}")

# 2) Build a chunk -> referenced-chunks map (TURBOPACK import format)
#    Look for patterns like "import(\"<chunk>\")" or chunk id references.
def refs(src):
    # TURBOPACK emits module ids; find quoted chunk filenames referenced
    found = set()
    for m in re.finditer(r'["\']([0-9a-zA-Z_\-]+\.js)["\']', src):
        found.add(m.group(1))
    return found

chunk_refs = {}
for f in files:
    p = os.path.join(base, f)
    try:
        src = open(p, encoding="utf-8", errors="ignore").read()
    except Exception:
        continue
    chunk_refs[f] = refs(src)

# 3) Which page entry chunks (from app-path-routes-manifest) transitively reach three chunks
#    Load the app-path-routes manifest to find page -> chunk mapping.
manifest_path = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/app-path-routes-manifest.json"
print("\n=== app-path-routes-manifest (first 2000 chars) ===")
print(open(manifest_path, encoding="utf-8").read()[:2000])
