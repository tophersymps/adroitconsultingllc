#!/usr/bin/env python3
"""Scrub legacy prose '## Practice Questions' sections from OmniStudio lesson MDX.

Question content now lives in the generated sidecar JSON tiers
(content/learn/omni-studio-cert/questions/<slug>.json) — prose questions in the
MDX would duplicate (and leak) content the site is deliberately gating.

Removes from the '## Practice Questions' line through the start of the next
'## ' heading (exclusive), collapsing trailing blank lines to a single blank
line. Both formats are handled:
  - lessons 1-5:  **Q:** + bullet options + **Answer: X** + explanation
  - lessons 6-8:  **Q1.** + inline letters + > **Correct: X** blockquote
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MDX_DIR = ROOT / "content" / "learn" / "omni-studio-cert"

HEADING_RE = re.compile(r"^##\s")
PRACTICE_RE = re.compile(r"^##\s+Practice Questions\s*$")

def scrub(raw: str) -> tuple[str, bool]:
    lines = raw.split("\n")
    out: list[str] = []
    i = 0
    changed = False
    while i < len(lines):
        line = lines[i]
        if PRACTICE_RE.match(line):
            changed = True
            # Skip to the next heading (inclusive of blank lines between).
            i += 1
            while i < len(lines) and not HEADING_RE.match(lines[i]):
                i += 1
            # We are now at the next heading (or EOF). The heading itself will
            # be emitted by the loop; trim trailing blanks from `out`, then
            # keep exactly ONE blank line of separation before the heading.
            while out and out[-1].strip() == "":
                out.pop()
            if out:
                out.append("")
            continue
        out.append(line)
        i += 1
    return "\n".join(out).rstrip() + "\n", changed

def main() -> int:
    files = sorted(MDX_DIR.glob("*.mdx"))
    changed_any = False
    for f in files:
        raw = f.read_text("utf-8")
        scrubbed, changed = scrub(raw)
        if changed:
            f.write_text(scrubbed, "utf-8")
            print(f"scrubbed: {f.name}")
            changed_any = True
        else:
            print(f"unchanged: {f.name}")
    if not changed_any:
        print("No Practice Questions sections found — nothing to scrub.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
