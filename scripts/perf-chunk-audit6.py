#!/usr/bin/env python3
"""Inspect TURBOPACK chunk reference format in the page entry chunks."""
import os, re

base = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
def read(f):
    return open(os.path.join(base, f), encoding="utf-8", errors="ignore").read()

# The /profile page chunk (FullSkySection) and /learn/[series] chunk
for f in ["24whfas0ed6-4.js", "2zw8fry9snjm9.js"]:
    src = read(f)
    print(f"===== {f} head (first 600 chars) =====")
    print(src[:600])
    print()
    # Find the TURBOPACK push array structure - look for chunk id references
    # TURBOPACK: push([script, chunkId, moduleId, fn, ...chunkIds])
    m = re.search(r'\.push\(\[[^\]]*\]', src)
    if m:
        print("PUSH ARRAY:", m.group(0)[:300])
    print()
