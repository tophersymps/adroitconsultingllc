#!/usr/bin/env python3
"""Measure the gzipped initial JS payload for each key page (bundle budget)."""
import re, urllib.request, os, gzip

BASE = "http://localhost:3100"
CHUNK_DIR = "/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/.next/static/chunks"

pages = {
    "index": "/",
    "blog": "/blog",
    "learn": "/learn",
    "search": "/tags",
    "cert": "/learn/salesforce-architect/certificate",
    "profile": "/profile",
    "learn-series": "/learn/salesforce-architect",
}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "ignore")

def gz_size(path):
    with open(path, "rb") as f:
        return len(gzip.compress(f.read(), 9))

for name, path in pages.items():
    html = fetch(BASE + path)
    chunks = set(re.findall(r'/_next/static/chunks/([0-9a-zA-Z_\-]+\.js)', html))
    raw = 0
    gz = 0
    missing = []
    for c in chunks:
        p = os.path.join(CHUNK_DIR, c)
        if os.path.exists(p):
            raw += os.path.getsize(p)
            gz += gz_size(p)
        else:
            missing.append(c)
    print(f"{name:14s} {path:45s} chunks={len(chunks):3d} raw={raw/1024:7.1f} KB  gzip={gz/1024:6.1f} KB  missing={missing}")
