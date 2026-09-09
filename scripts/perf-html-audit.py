#!/usr/bin/env python3
"""Fetch each page's HTML, extract the JS chunk script srcs, and check whether
any of the three.js chunks are referenced in the initial payload."""
import re, urllib.request, os

BASE = "http://localhost:3100"
THREE = ["0t6-cctd-gvb2", "0vu2uelfuqxq_", "24whfas0ed6-4", "2zw8fry9snjm9", "0dvyw9jc7j8bc", "03qq7w9rkmz3j"]

pages = {
    "index": "/",
    "blog": "/blog",
    "learn": "/learn",
    "catalog": "/learn",       # catalog is the learn hub
    "search": "/tags",         # search/tags hub
    "cert": "/learn/salesforce-architect/certificate",
    "profile": "/profile",
    "learn-series": "/learn/salesforce-architect",
}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode("utf-8", "ignore")
    except Exception as e:
        return f"ERROR: {e}"

for name, path in pages.items():
    html = fetch(BASE + path)
    if html.startswith("ERROR"):
        print(f"{name:14s} {path:45s} {html}")
        continue
    # extract chunk script srcs
    chunks = re.findall(r'/_next/static/chunks/([0-9a-zA-Z_\-]+\.js)', html)
    three_hits = [c for c in chunks if any(t in c for t in THREE)]
    # also check inline for the three chunk names anywhere in HTML
    inline_three = [t for t in THREE if t in html]
    print(f"{name:14s} {path:45s} chunks={len(chunks):3d} three_in_scripts={three_hits} three_in_html={inline_three}")
