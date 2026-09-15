#!/usr/bin/env python3
"""Perf chunk audit v3: build the TURBOPACK chunk dependency graph and trace
which page entry chunks transitively reach the three.js chunks."""
import os, re

base = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
files = [f for f in os.listdir(base) if f.endswith(".js")]

def read(f):
    return open(os.path.join(base, f), encoding="utf-8", errors="ignore").read()

# The three.js chunks (identified by content markers)
three_core = "0t6-cctd-gvb2.js"          # three core + r3f + postprocessing
three_canvas = "0vu2uelfuqxq_.js"        # ConstellationCanvas (r3f Canvas shell)
# scene chunks
scene_chunks = [f for f in files if f in ("24whfas0ed6-4.js","2zw8fry9snjm9.js","0dvyw9jc7j8bc.js","03qq7w9rkmz3j.js")]
three_set = set([three_core, three_canvas] + scene_chunks)

# TURBOPACK chunk references: each chunk's push array lists other chunk ids.
# Pattern: push(["<currentScript>", <chunkId>, <moduleId>, fn, ...otherChunkIds...])
# We extract all .js filenames referenced inside each chunk body.
def refs(src):
    found = set()
    for m in re.finditer(r'["\']([0-9a-zA-Z_\-]+\.js)["\']', src):
        found.add(m.group(1))
    return found

chunk_refs = {f: refs(read(f)) for f in files}

# BFS from a set of roots over the reference graph
def reachable(roots):
    seen = set(roots)
    stack = list(roots)
    while stack:
        cur = stack.pop()
        for nxt in chunk_refs.get(cur, set()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen

# Find page entry chunks: those referenced by the app-path-routes manifest or
# the rootMainFiles. Instead, find chunks that contain page component markers.
# Page entry chunks are the ones loaded first per route. We'll identify them by
# scanning the app-path-routes-manifest's sibling _buildManifest or by the
# presence of page-specific strings.
# Simpler: find chunks that reference the three chunks (direct importers).
print("=== chunks that DIRECTLY reference a three.js chunk ===")
for f in files:
    inter = chunk_refs.get(f, set()) & three_set
    if inter:
        print(f"{os.path.getsize(os.path.join(base,f))/1024:8.1f} KB  {f}  -> {sorted(inter)}")

# Now find which chunks reference the direct importers (transitive importers)
direct = [f for f in files if chunk_refs.get(f, set()) & three_set]
print("\n=== chunks that transitively reach three (2 levels) ===")
level2 = set()
for f in files:
    if chunk_refs.get(f, set()) & set(direct):
        level2.add(f)
for f in sorted(level2):
    print(f"{os.path.getsize(os.path.join(base,f))/1024:8.1f} KB  {f}")
