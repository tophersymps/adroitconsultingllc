#!/usr/bin/env python3
"""Inspect live Neon catalog state (courses, sections, groups, prerequisites).

Read-only. Rewritten for Neon on 2026-10-23 (was a Supabase PostgREST reader for
t_f94e01d5). Connects over DATABASE_URL — this is the privileged/reporting path;
the site itself reads through the Neon Data API. Nothing here writes.

Runs four compact queries and prints a state summary plus the "content exists but
no courses row" check that the original inspector carried.

  python3 scripts/inspect-learn-catalog.py
  DATABASE_URL=postgres://... python3 scripts/inspect-learn-catalog.py
"""
import os
import subprocess
import sys

ENV_FILES = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local"),
    os.path.expanduser("~/Documents/Projects/adroit-code/.env.local"),
    os.path.expanduser("~/Documents/Projects/adroit-site-copy/.env.local"),
]

# Series that ship content in the repo and therefore must have a courses row.
EXPECTED_SERIES = [
    "hermes-consultant", "hermes-consultant-intermediate", "hermes-consultant-advanced",
    "agentic-ai", "ai-at-work", "salesforce-architect", "omni-studio-cert",
]


def load_env():
    keys = {}
    for path in ENV_FILES:
        try:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        keys.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            continue
    return keys


def dsn(keys):
    return (os.environ.get("DATABASE_URL_UNPOOLED") or keys.get("DATABASE_URL_UNPOOLED")
            or os.environ.get("DATABASE_URL") or keys.get("DATABASE_URL"))


def query(dsn_url, sql):
    """Return (rows_as_lists, error)."""
    cmd = ["psql", dsn_url, "-X", "-q", "-A", "-t", "-F", "\x1f", "-c", sql]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return [], (proc.stderr or proc.stdout).strip()
    rows = [line.split("\x1f") for line in proc.stdout.strip().splitlines() if line]
    return rows, None


def main():
    keys = load_env()
    url = dsn(keys)
    if not url:
        print("ERROR: DATABASE_URL not found in env or .env.local")
        return 1

    courses, err = query(url,
        "SELECT series_slug, status, access_model, COALESCE(track,''), "
        "COALESCE(level::text,''), sort_order::text, "
        "COALESCE(difficulty,'-'), "
        "CASE WHEN recommended_background IS NULL THEN 'n' ELSE 'Y' END, "
        "CASE WHEN audience IS NULL THEN 'n' ELSE 'Y' END, "
        "COALESCE(jsonb_array_length(learning_outcomes)::text,'0'), "
        "COALESCE(array_length(course_tags,1)::text,'0'), "
        "COALESCE(section_id::text,'-'), COALESCE(group_id::text,'-') "
        "FROM public.courses ORDER BY sort_order;")
    if err:
        print(f"courses query failed: {err}")
        return 1
    print(f"== courses ({len(courses)}) ==")
    for (slug, status, model, track, level, sort, diff, bg, aud, outs, tags, sec, grp) in courses:
        print(f"  {slug:<32} status={status:<9} model={model:<14} track={track or '-':<24} "
              f"lvl={level or '-':<3} sort={sort:<4} diff={diff:<12} bg={bg} aud={aud} "
              f"outs={outs} tags={tags} section={sec[:8]} group={grp[:8]}")

    sections, err = query(url,
        "SELECT slug, id::text FROM public.catalog_sections ORDER BY sort_order;")
    print(f"\n== catalog_sections ({len(sections)}) ==")
    for slug, sid in sections:
        print(f"  {slug:<20} id={sid[:8]}")

    groups, err = query(url,
        "SELECT g.slug, s.slug, g.id::text FROM public.catalog_groups g "
        "LEFT JOIN public.catalog_sections s ON s.id = g.section_id "
        "ORDER BY g.sort_order;")
    print(f"\n== catalog_groups ({len(groups)}) ==")
    for slug, sec, gid in groups:
        print(f"  {slug:<32} section={sec or '?':<16} id={gid[:8]}")

    prereqs, err = query(url,
        "SELECT course_id::text, required_course_id::text, sort_order::text "
        "FROM public.course_prerequisites ORDER BY sort_order;")
    print(f"\n== course_prerequisites ({len(prereqs)}) ==")
    for cid, rid, sort in prereqs:
        print(f"  course={cid[:8]} requires={rid[:8]} sort={sort}")

    have = {c[0] for c in courses}
    print("\n== content series with no courses row ==")
    missing = [s for s in EXPECTED_SERIES if s not in have]
    for slug in missing or []:
        print(f"  MISSING: {slug}")
    if not missing:
        print("  none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
