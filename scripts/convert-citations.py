#!/usr/bin/env python3
"""Convert adroit-blog inline `[Source: ...](url)` / `[Source: url]` citations
into GFM endnotes (`[^n]` markers + numbered footnote definitions), matching
the editorial standard. The renderer's remark-gfm builds the superscript
markers and an auto-numbered "Sources" list at the end of the article.

Dry-run mode: `python3 convert-citations.py --dry-run` prints a per-article
summary and the proposed footnote ordering without writing.
Stdlib only.
"""
import argparse
import glob
import re
import sys
from urllib.parse import urlparse

LINK_FORM = re.compile(r"\[Source:\s+[^\]]+\]\((https?://[^)\s]+)\)")
LITERAL_FORM = re.compile(r"\[Source:\s+(https?://[^\]\s]+)\]")
SRC_LINE = re.compile(r"^-\s+(.*?)\s*—\s*\[[^\]]+\]\((https?://[^)]+)\)\s*$")


def domain_of(url):
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return url


def read_article(path):
    t = open(path).read()
    parts = t.split("---\n", 2)
    assert len(parts) == 3, f"frontmatter delimiters not found in {path}"
    return parts[0], parts[1], parts[2]


def find_sources_block(body):
    """Return (prose_end_idx, block_start_idx, url->title map, listed_urls)."""
    m = re.search(r"\n##\s+Sources\s*\n", body)
    if not m:
        return None, None, {}, set()
    # prose ends where the heading starts; the block (bullets) begins after it
    prose_end = m.start()
    block_start = m.end()
    urls, listed = {}, set()
    for line in body[block_start:].splitlines():
        sm = SRC_LINE.match(line.strip())
        if sm:
            title, url = sm.group(1).strip(), sm.group(2)
            urls[url] = title
            listed.add(url)
    return prose_end, block_start, urls, listed


def convert(path, dry_run):
    fm1, fm2, body = read_article(path)
    prose_end, _block_start, title_map, listed = find_sources_block(body)
    has_sources = prose_end is not None

    # Collect inline citations in order of first appearance.
    # Prefer full link form; also catch bare literal form.
    ordered = []  # list of (url, match_obj) in doc order
    seen = set()
    # Walk with combined regex so we preserve doc order between both forms
    combined = re.compile(
        r"\[Source:\s+(?:[^\]]+\]\((https?://[^)\s]+)\)|(https?://[^\]\s]+)\])"
    )
    for m in combined.finditer(body):
        url = m.group(1) or m.group(2)
        if url and url not in seen:
            seen.add(url)
        if url:
            ordered.append((url, m))

    cited_urls = [u for u, _ in ordered]
    cited_set = set(cited_urls)

    # Assign footnote numbers in first-appearance order
    num = {u: i + 1 for i, u in enumerate(dict.fromkeys(cited_urls))}

    # Rebuild body prose with [^n] markers (only the prose region, if a
    # Sources block is present we end prose where the heading begins)
    prose = body[:prose_end] if has_sources else body

    def repl(m):
        url = m.group(1) or m.group(2)
        return f"[^{num[url]}]"

    new_prose = combined.sub(repl, prose)

    # Build footnote definitions in number order (period title/link separator
    # and colon subtitle separator — NO em-dashes, per Chris's rule)
    defs = []
    for u in sorted(num, key=num.get):
        title = title_map.get(u) or domain_of(u)
        title = re.sub(r"\s*—\s*", ": ", title)
        defs.append(f"[^{num[u]}]: {title}. [{domain_of(u)}]({u})")

    # Handle listed-but-never-cited context sources: keep as unnumbered
    # "Further reading" bullets (remark-gfm drops unused footnote defs).
    uncited = sorted(listed - cited_set)
    further = []
    if uncited:
        further.append("")
        further.append("**Further reading:**")
        for u in uncited:
            title = title_map.get(u) or domain_of(u)
            further.append(f"- {title} — [{domain_of(u)}]({u})")

    # Note: NO "## Sources" heading here. remark-gfm generates the numbered
    # source section itself (labelled "Sources" via footnoteLabel in the
    # MDXArticle renderer) and hoists these definitions into it. A manual
    # "## Sources" heading would render as a duplicate empty heading above the
    # auto-generated section.
    new_sources = "\n\n" + "\n".join(defs) + "\n".join(further) + "\n"

    final_body = new_prose.rstrip() + new_sources

    # Summary
    n_defs = len(defs)
    n_uncited = len(uncited)
    summary = (
        f"{path.split('/')[-1]}: {len(cited_urls)} inline -> {n_defs} footnotes"
        f"{' + ' + str(n_uncited) + ' further-reading' if n_uncited else ''}"
    )
    if dry_run:
        print(summary)
        return None
    full = fm1 + "---\n" + fm2 + "---\n" + final_body
    return full


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("paths", nargs="*")
    args = ap.parse_args()

    paths = args.paths or sorted(glob.glob("content/blog/*.mdx"))
    changed = []
    for p in paths:
        body = read_article(p)[2]
        if "Source:" not in body:
            continue  # no inline citations (e.g. digital-transformation)
        out = convert(p, args.dry_run)
        if out is not None:
            changed.append((p, out))
    if args.dry_run:
        print(f"\n{len(changed)} articles would change")
        return
    for p, out in changed:
        with open(p, "w") as f:
            f.write(out)
        print(f"WROTE {p}")


if __name__ == "__main__":
    main()
