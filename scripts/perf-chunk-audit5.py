#!/usr/bin/env python3
"""Find which chunks contain the public 3D entry components."""
import os

base = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"
files = [f for f in os.listdir(base) if f.endswith(".js")]

def read(f):
    return open(os.path.join(base, f), encoding="utf-8", errors="ignore").read()

for marker in ["ProfileGalaxy3D", "SeriesConstellation3D", "FullSkySection", "Materializing your galaxy", "Charting your sky"]:
    print(f"=== marker: {marker} ===")
    for f in files:
        if marker in read(f):
            print(f"  {os.path.getsize(os.path.join(base,f))/1024:8.1f} KB  {f}")
