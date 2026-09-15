#!/usr/bin/env python3
"""One-time backfill: publish OmniStudio curriculum days 1-3 to the blog Learn tab.

Reads the curriculum module (source of truth) and writes lesson MDX files to
content/learn/omni-studio-cert/, so the Learn tab shows the cert series
immediately. Going forward, the 8am OmniStudio cron prompt does this per-day.

Usage: python3 backfill-omni-learn.py
"""
import importlib.util, json, os
from datetime import date

REPO = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog")
OUT = os.path.join(REPO, "content/learn/omni-studio-cert")
SPEC = importlib.util.spec_from_file_location(
    "osc", os.path.expanduser("~/.hermes/scripts/omni-studio-curriculum.py"))
osc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(osc)

# day -> display date (day 1 = 2026-08-03)
def day_date(n):
    d = date(2026, 8, 3).toordinal() + (n - 1)
    return date.fromordinal(d).strftime("%B %d, %Y")

def slugify(s):
    return s.lower().replace("&", "and").replace("/", "-").replace(",", "") \
        .replace(";", "").replace("(", "").replace(")", "").replace(":", "") \
        .replace("  ", " ").strip().replace(" ", "-")[:50].rstrip("-")

def lesson_body(c):
    lines = []
    lines.append(f"# {c['title']}\n")
    lines.append(f"**Exam guide requirement:** {c['req']}\n")
    lines.append(f"**Domain:** {c['domain']} ({c['weight']})\n")
    lines.append("## Deep Dive\n")
    for b in c.get("deep", []):
        lines.append(f"- {b}")
    if c.get("config"):
        lines.append("\n## Configuration Walkthrough\n")
        for i, step in enumerate(c["config"], 1):
            lines.append(f"{i}. {step}")
    if c.get("traps"):
        lines.append("\n## Exam Traps\n")
        for t in c["traps"]:
            lines.append(f"- **Trap:** {t}")
    if c.get("questions"):
        lines.append("\n## Practice Questions\n")
        for q in c["questions"]:
            if isinstance(q, tuple):
                qtext, options, answer, *rest = q
                expl = rest[0] if rest else ""
            else:
                qtext = q.get("q", q.get("question", ""))
                options = q.get("options", [])
                answer = q.get("answer", q.get("correct", ""))
                expl = q.get("explanation", "")
            lines.append(f"**Q: {qtext}**")
            for opt in options:
                lines.append(f"- {opt}")
            lines.append(f"\n**Answer: {answer}**")
            if expl:
                lines.append(f"\n{expl}")
            lines.append("")
    if c.get("tip"):
        lines.append(f"\n## Exam Tip\n\n{c['tip']}\n")
    if c.get("related"):
        rel = ", ".join(str(r) for r in c["related"])
        lines.append(f"\n**Related requirements:** {rel}\n")
    for u in (c.get("guide_url"), c.get("trailmix_url")):
        if u:
            lines.append(f"\n- [Reference]({u})")
    return "\n".join(lines)

def main():
    os.makedirs(OUT, exist_ok=True)
    written = []
    for c in osc.CURRICULUM:
        day = c["day"]
        if day > 3:
            continue
        fid = c["id"].lower().replace("-", "")
        slug = f"day-{day:02d}-{fid}-{slugify(c['title'])}"
        fm = [
            "---",
            f"title: \"OmniStudio {c['id']}: {c['title']}\"",
            f"slug: {slug}",
            "series: omni-studio-cert",
            f"lesson: {day}",
            f"excerpt: \"{c['req'][:150].rstrip()} — Day {day} of the 46-requirement OmniStudio Developer exam prep.\"",
            f"date: \"{day_date(day)}\"",
            "author: \"Adroit Consulting\"",
            "readTime: \"6 min read\"",
            f"tags: [OmniStudio, {c['domain']}]",
            "---",
            "",
        ]
        body = lesson_body(c)
        path = os.path.join(OUT, f"{slug}.mdx")
        with open(path, "w") as f:
            f.write("\n".join(fm) + body + "\n")
        written.append((day, c["id"], slug))
        print(f"wrote day {day} {c['id']}: {slug}")

    print(f"\n{len(written)} lessons written to {OUT}")

if __name__ == "__main__":
    main()
