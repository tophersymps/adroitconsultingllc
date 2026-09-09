#!/usr/bin/env python3
"""Replace the em-dash separator in footnote definitions with a period, per
Chris's 'no em dashes anywhere' rule. Only touches lines that are footnote
definitions ([^n]: Title — [url]) — never prose.
Run from the blog repo root: python3 scripts/fix-footnote-dashes.py
"""
import glob
import re

FN = re.compile(r"^(\[\^\d+\]:\s+.+)$")

def fix_line(line: str) -> str:
    """In a footnote def, replace the LAST em-dash before the [link] with a
    period (title/link separator); replace any earlier em-dash with a colon
    (subtitle separator, e.g. 'Princeton HAL — GAIA Leaderboard')."""
    # find the last '—' that is followed (after whitespace) by '[domain](url)'
    last = None
    for m in re.finditer(r"—", line):
        tail = line[m.end():].lstrip()
        if tail.startswith("["):
            last = m
    if last is None:
        # no em-dash immediately precedes the link (separator already a
        # period); any remaining em-dash is an internal title/subtitle
        # separator -> colon (drop the surrounding spaces)
        return re.sub(r"\s*—\s*", ": ", line)
    head, tail = line[: last.start()], line[last.end():].lstrip()
    # internal em-dashes in the title -> colon (subtitle separator)
    head = re.sub(r"\s*—\s*", ": ", head)
    return f"{head.rstrip()}. {tail}"

changed = 0
for path in sorted(glob.glob("content/blog/*.mdx")):
    t = open(path).read()
    lines = t.split("\n")
    new_lines = []
    file_changed = 0
    for line in lines:
        if FN.match(line) and "—" in line:
            fixed = fix_line(line)
            if fixed != line:
                new_lines.append(fixed)
                file_changed += 1
                continue
        new_lines.append(line)
    if file_changed:
        open(path, "w").write("\n".join(new_lines))
        changed += file_changed
        print(f"{path.split('/')[-1]}: {file_changed} footnote dashes fixed")

print(f"\nTotal footnote em-dashes fixed: {changed}")
