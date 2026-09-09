#!/usr/bin/env python3
"""Inspect live Supabase courses + catalog state (read-only) for task t_f94e01d5.

Reads env from .env.local (service role key), queries the live DB courses,
catalog_sections, catalog_groups, course_prerequisites. Prints a compact
state summary so the provisioning/population work can be planned precisely.
"""
import json
import os
import urllib.request
import urllib.error

ENV = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog/.env.local")

def load_env():
    keys = {}
    with open(ENV) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                keys[k.strip()] = v.strip()
    return keys

def get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.reason}

def main():
    keys = load_env()
    url_base = keys.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    srv = keys.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url_base or not srv or "..." in srv:
        print("WARNING: service key or url missing/truncated in .env.local")
        return
    headers = {"apikey": srv, "Authorization": f"Bearer {srv}",
               "Content-Type": "application/json"}
    base = f"{url_base}/rest/v1"

    # Courses
    sel = ("id,series_slug,title,status,access_model,section_id,group_id,track,"
           "level,sort_order,difficulty,recommended_background,audience,"
           "learning_outcomes,course_tags")
    st, courses = get(f"{base}/courses?select={sel}&order=sort_order", headers)
    print(f"== courses (http {st}) ==")
    for c in courses or []:
        print(f"  {c['series_slug']:<32} status={c.get('status'):<9} model={c.get('access_model'):<14} "
              f"track={c.get('track')} lvl={c.get('level')} sort={c.get('sort_order')} "
              f"diff={c.get('difficulty')} bg={'Y' if c.get('recommended_background') else 'n'} "
              f"aud={'Y' if c.get('audience') else 'n'} outs={len(c.get('learning_outcomes') or [])} "
              f"tags={len(c.get('course_tags') or [])}")

    st, sections = get(f"{base}/catalog_sections?select=*&order=sort_order", headers)
    print(f"\n== catalog_sections (http {st}) ==")
    for s in sections or []:
        print(f"  {s['slug']:<20} id={s['id'][:8]}")
    sections_by_slug = {s["slug"]: s for s in (sections or [])}

    st, groups = get(f"{base}/catalog_groups?select=*&order=sort_order", headers)
    print(f"\n== catalog_groups (http {st}) ==")
    for g in groups or []:
        sec = next((k for k, v in sections_by_slug.items() if v["id"] == g["section_id"]), "?")
        print(f"  {g['slug']:<32} section={sec:<16} id={g['id'][:8]}")

    st, prereqs = get(f"{base}/course_prerequisites?select=*&order=sort_order", headers)
    print(f"\n== course_prerequisites (http {st}) — {len(prereqs or [])} rows ==")
    for p in prereqs or []:
        print(f"  course={p['course_id'][:8]} requires={p['required_course_id'][:8]} sort={p['sort_order']}")

    courses_by_slug = {c["series_slug"]: c for c in (courses or [])}
    print("\n== courses with no row in live DB ==")
    from os.path import isdir
    for slug in ["hermes-consultant", "hermes-consultant-intermediate",
                 "hermes-consultant-advanced", "agentic-ai", "ai-at-work",
                 "salesforce-architect", "omni-studio-cert"]:
        if slug not in courses_by_slug:
            print(f"  MISSING: {slug}")

if __name__ == "__main__":
    main()
