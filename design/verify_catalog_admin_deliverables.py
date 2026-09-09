#!/usr/bin/env python3
"""Structural sanity check for the course-catalog+admin execution mockups
and the design-system report. Design-only check (app itself untouched).
"""
import html.parser, sys
from pathlib import Path

BASE = Path(__file__).parent
FILES = {
    "mockup-admin-courses.html":        ["sidebar", "toolbar", "statrow", "table-card", "status-badge", "toast"],
    "mockup-admin-users-matrix.html":   ["sidebar", "toolbar", "tabs", "table-card", "matrix", "overlay", "modal", "toast"],
    "mockup-learn-catalog.html":        ["header", "hero", "grid", "path", "status-badge", "am-granted"],
    "mockup-paywall.html":              ["syllabus", "peek", "lesson-row", "paywall", "option"],
    "design-system-course-catalog-admin.html": ["report-head", "tokens", "gallery", "surface-row", "handoff"],
}

class P(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.classes = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        for c in d.get("class", "").split():
            self.classes.append(c)

fails = []
for name, needed in FILES.items():
    path = BASE / name
    if not path.exists():
        fails.append(f"MISSING FILE: {name}")
        continue
    par = P(); par.feed(path.read_text())
    cset = set(par.classes)
    for n in needed:
        if not any(n in c for c in cset):
            fails.append(f"{name}: missing class/token marker '{n}'")

if fails:
    print("FAIL\n" + "\n".join(fails)); sys.exit(1)
print("OK — all 5 deliverable HTML files present with expected structural markers.")