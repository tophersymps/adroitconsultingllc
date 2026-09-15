#!/usr/bin/env python3
"""Perf chunk audit v2: identify the 3 lazy 3D chunks by component name, and
trace which page entries transitively pull them."""
import os, re

base = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
files = [f for f in os.listdir(base) if f.endswith(".js")]

def read(f):
    return open(os.path.join(base, f), encoding="utf-8", errors="ignore").read()

# 1) Find chunks containing the 3D component names
targets = {
    "ConstellationCanvas": "ConstellationCanvas",
    "ProfileScene": "ProfileScene",
    "SeriesScene": "SeriesScene",
    "three-core": "three@",
}
print("=== chunks containing 3D component markers ===")
for f in files:
    src = read(f)
    hits = [name for name, marker in targets.items() if marker in src]
    if hits:
        print(f"{os.path.getsize(os.path.join(base,f))/1024:8.1f} KB  {f}  -> {hits}")

# 2) Check the 424 chunk that earlier grep flagged
print("\n=== 424-gewe1x2js.js three-related markers ===")
p = os.path.join(base, "424-gewe1x2js.js")
if os.path.exists(p):
    src = read("424-gewe1x2js.js")
    for m in re.finditer(r'.{40}(three|THREE|react-three).{40}', src):
        print(repr(m.group(0)))
