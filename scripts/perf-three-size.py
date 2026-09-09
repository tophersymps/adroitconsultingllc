#!/usr/bin/env python3
"""Gzipped size of the three.js chunks (cost when 3D actually loads)."""
import os, gzip

CHUNK_DIR = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
targets = {
    "0t6-cctd-gvb2.js": "three core + r3f + postprocessing",
    "0vu2uelfuqxq_.js": "ConstellationCanvas (r3f Canvas shell)",
    "24whfas0ed6-4.js": "profile page entry (FullSkySection/ProfileGalaxy3D)",
    "2zw8fry9snjm9.js": "learn-series page entry (SeriesConstellation3D)",
    "0dvyw9jc7j8bc.js": "ProfileScene sub-chunk",
    "03qq7w9rkmz3j.js": "SeriesScene sub-chunk",
}
total_gz = 0
for f, label in targets.items():
    p = os.path.join(CHUNK_DIR, f)
    if os.path.exists(p):
        raw = os.path.getsize(p)
        gz = len(gzip.compress(open(p,"rb").read(), 9))
        total_gz += gz
        print(f"{f:22s} raw={raw/1024:7.1f} KB  gzip={gz/1024:6.1f} KB  {label}")
    else:
        print(f"{f:22s} MISSING")
print(f"\nTotal 3D payload (all chunks) gzip = {total_gz/1024:.1f} KB")
