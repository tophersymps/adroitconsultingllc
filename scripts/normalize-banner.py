#!/usr/bin/env python3
"""Normalize an article banner image for deploy weight.

Takes a generated banner master (usually a 2752x1536 PNG, 2-7 MB) and emits the
two derivatives the site actually needs:

  <name>.webp        1600 px wide  -> on-page banner (next/image display slot is 560 CSS px)
  <name>-og.jpg      1200x630      -> OG/social card (JPEG: some scrapers still refuse WebP)

Measured on the 2026-10-22 backfill: 8.1x smaller than the PNG masters.

Usage:
  normalize-banner.py <source-image> [...]            # write derivatives beside the source
  normalize-banner.py --out-dir DIR <source>          # write into another directory
  normalize-banner.py --keep-source <source>          # do not delete the master (default: delete)
  normalize-banner.py --archive-dir DIR <source>      # move the master here instead of deleting
  normalize-banner.py --dry-run --verbose <source>

Exit codes: 0 ok, 1 an input failed to process, 2 bad usage.
"""
import argparse
import io
import os
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: python3 -m pip install Pillow")

DISPLAY_WIDTH = 1600
WEBP_QUALITY = 82
WEBP_METHOD = 6
OG_SIZE = (1200, 630)
OG_QUALITY = 82


def _cover_crop(im, target_w, target_h):
    """Crop to the target aspect ratio (center), then resize."""
    w, h = im.size
    tr = target_w / target_h
    if w / h > tr:
        nw = round(h * tr)
        left = (w - nw) // 2
        return im.crop((left, 0, left + nw, h)).resize((target_w, target_h), Image.LANCZOS)
    nh = round(w / tr)
    top = (h - nh) // 2
    return im.crop((0, top, w, top + nh)).resize((target_w, target_h), Image.LANCZOS)


def build(source, out_dir=None, keep_source=False, archive_dir=None, dry_run=False, verbose=False):
    """Emit <stem>.webp and <stem>-og.jpg for one source image. Returns (webp_path, og_path, stats)."""
    if not os.path.isfile(source):
        raise FileNotFoundError(source)
    stem, _ = os.path.splitext(os.path.basename(source))
    out_dir = out_dir or os.path.dirname(os.path.abspath(source))
    os.makedirs(out_dir, exist_ok=True)
    webp_path = os.path.join(out_dir, f"{stem}.webp")
    og_path = os.path.join(out_dir, f"{stem}-og.jpg")

    src_bytes = os.path.getsize(source)
    with Image.open(source) as raw:
        im = raw.convert("RGB")
        w, h = im.size
        display = im.resize((DISPLAY_WIDTH, round(h * DISPLAY_WIDTH / w)), Image.LANCZOS) if w > DISPLAY_WIDTH else im
        og = _cover_crop(im, *OG_SIZE)

    buf_webp = io.BytesIO()
    display.save(buf_webp, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    buf_og = io.BytesIO()
    og.save(buf_og, "JPEG", quality=OG_QUALITY, optimize=True, progressive=True)
    webp_bytes = buf_webp.getvalue()
    og_bytes = buf_og.getvalue()

    if not dry_run:
        with open(webp_path, "wb") as fh:
            fh.write(webp_bytes)
        with open(og_path, "wb") as fh:
            fh.write(og_bytes)
        if not keep_source:
            if archive_dir:
                os.makedirs(archive_dir, exist_ok=True)
                shutil.move(source, os.path.join(archive_dir, os.path.basename(source)))
            else:
                os.remove(source)

    stats = {
        "source": os.path.basename(source),
        "src_bytes": src_bytes,
        "webp_bytes": len(webp_bytes),
        "og_bytes": len(og_bytes),
    }
    if verbose:
        total = stats["webp_bytes"] + stats["og_bytes"]
        print(
            f"{stats['source']}: {src_bytes / 1e6:.1f} MB -> "
            f"webp {stats['webp_bytes'] / 1024:.0f}K + og {stats['og_bytes'] / 1024:.0f}K "
            f"({src_bytes / total:.1f}x)"
        )
    return webp_path, og_path, stats


def main(argv=None):
    ap = argparse.ArgumentParser(description="Emit 1600px WebP + 1200x630 OG JPEG for banner masters.")
    ap.add_argument("sources", nargs="+", help="source image file(s)")
    ap.add_argument("--out-dir", help="write derivatives here instead of beside each source")
    ap.add_argument("--keep-source", action="store_true", help="keep the master image")
    ap.add_argument("--archive-dir", help="move masters here instead of deleting them")
    ap.add_argument("--dry-run", action="store_true", help="measure only, write nothing")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    failures, src_total, out_total = 0, 0, 0
    for source in args.sources:
        try:
            _, _, stats = build(
                source,
                out_dir=args.out_dir,
                keep_source=args.keep_source,
                archive_dir=args.archive_dir,
                dry_run=args.dry_run,
                verbose=args.verbose,
            )
            src_total += stats["src_bytes"]
            out_total += stats["webp_bytes"] + stats["og_bytes"]
        except Exception as exc:  # noqa: BLE001 - report and continue over a batch
            failures += 1
            print(f"FAILED {source}: {exc}", file=sys.stderr)

    if args.dry_run:
        print(f"dry-run: {len(args.sources) - failures} ok, {failures} failed")
    if out_total:
        print(
            f"total: {src_total / 1048576:.1f} MB -> {out_total / 1048576:.1f} MB "
            f"({src_total / out_total:.1f}x smaller)"
        )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
