"""
Generate all logo deliverable assets from the high-resolution master.

Pipeline:
  1. Load the hi-res generated logo
  2. Remove white background → transparent
  3. Auto-crop to content bounding box
  4. Pad to square with even margins
  5. Save as the canonical 1024px master
  6. Derive all web / social / email / favicon assets from the master
"""

import base64
import io
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
HIRES_SOURCE = Path(
    "/Users/tophersymps/.cursor/projects/"
    "Users-tophersymps-Documents-Adroit-Consulting-AdroitConsultingSIte/"
    "assets/adroit-logo-master-hires-v2.png"
)
MASTER_PATH = ROOT / "source" / "adroit-logo-master-1024.png"

CARMINE = (165, 0, 68)
NAVY = (0, 77, 152)
CHARCOAL = (31, 41, 55)
WHITE = (255, 255, 255)

MASTER_SIZE = 1024


def ensure_dirs():
    for d in ["source", "web", "social", "email-signature"]:
        (ROOT / d).mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Master preparation
# ---------------------------------------------------------------------------

def remove_white_bg(img, threshold=240):
    """Replace near-white pixels with full transparency."""
    arr = np.array(img.convert("RGBA")).copy()
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    is_white = (r >= threshold) & (g >= threshold) & (b >= threshold)
    arr[is_white, 3] = 0
    return Image.fromarray(arr, "RGBA")


def auto_crop(img, padding=0):
    """Crop to the bounding box of non-transparent content."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    rmin = max(rmin - padding, 0)
    rmax = min(rmax + padding, arr.shape[0] - 1)
    cmin = max(cmin - padding, 0)
    cmax = min(cmax + padding, arr.shape[1] - 1)
    return img.crop((cmin, rmin, cmax + 1, rmax + 1))


def pad_to_square(img, margin_pct=0.08):
    """Pad image to a square with even transparent margins."""
    w, h = img.size
    side = int(max(w, h) * (1 + 2 * margin_pct))
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    x = (side - w) // 2
    y = (side - h) // 2
    canvas.paste(img, (x, y), img)
    return canvas


def build_master():
    """Create a clean, square, transparent master from the hi-res source."""
    print(f"Loading hi-res source: {HIRES_SOURCE}")
    raw = Image.open(HIRES_SOURCE)
    print(f"  Raw size: {raw.size}")

    transparent = remove_white_bg(raw, threshold=240)
    cropped = auto_crop(transparent, padding=4)
    print(f"  Cropped to content: {cropped.size}")

    squared = pad_to_square(cropped, margin_pct=0.06)
    print(f"  Padded to square: {squared.size}")

    master = squared.resize((MASTER_SIZE, MASTER_SIZE), Image.LANCZOS)
    master.save(MASTER_PATH, "PNG", optimize=True)
    print(f"  Master saved: {MASTER_SIZE}x{MASTER_SIZE}")
    return master


# ---------------------------------------------------------------------------
# Asset generation helpers
# ---------------------------------------------------------------------------

def save_png(master, size, output_path):
    if isinstance(size, tuple):
        resized = master.resize(size, Image.LANCZOS)
    else:
        resized = master.resize((size, size), Image.LANCZOS)
    resized.save(output_path, "PNG", optimize=True)


def make_monochrome(master, color):
    arr = np.array(master).copy()
    visible = arr[:, :, 3] > 0
    arr[visible, 0] = color[0]
    arr[visible, 1] = color[1]
    arr[visible, 2] = color[2]
    return Image.fromarray(arr, "RGBA")


def png_to_data_uri(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ---------------------------------------------------------------------------
# Web assets
# ---------------------------------------------------------------------------

def generate_web_pngs(master):
    sizes = {
        "adroit-logo-fullcolor-512.png": 512,
        "adroit-logo-fullcolor-256.png": 256,
        "adroit-logo-fullcolor-128.png": 128,
        "adroit-logo-fullcolor-64.png": 64,
    }
    for name, size in sizes.items():
        save_png(master, size, ROOT / "web" / name)

    save_png(master, 32, ROOT / "web" / "adroit-favicon-32.png")
    save_png(master, 16, ROOT / "web" / "adroit-favicon-16.png")
    save_png(master, 180, ROOT / "web" / "adroit-apple-touch-icon-180.png")


def generate_svg_wrapper(img, output_path, display_size=512):
    data_uri = png_to_data_uri(img)
    w, h = img.size
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{display_size}" height="{display_size}" '
        f'viewBox="0 0 {w} {h}">\n'
        f'  <image width="{w}" height="{h}" href="{data_uri}"/>\n'
        f'</svg>\n'
    )
    output_path.write_text(svg)


def generate_web_svgs(master):
    full = master.resize((512, 512), Image.LANCZOS)
    generate_svg_wrapper(full, ROOT / "web" / "adroit-logo-fullcolor-lightbg.svg")
    generate_svg_wrapper(full, ROOT / "web" / "adroit-logo-fullcolor-darkbg.svg")

    mono_navy = make_monochrome(master, NAVY).resize((512, 512), Image.LANCZOS)
    generate_svg_wrapper(mono_navy, ROOT / "web" / "adroit-logo-monochrome-navy.svg")

    mono_white = make_monochrome(master, WHITE).resize((512, 512), Image.LANCZOS)
    generate_svg_wrapper(mono_white, ROOT / "web" / "adroit-logo-monochrome-white.svg")


def create_ico(master, output_path):
    sizes = [16, 32, 48]
    imgs = [master.resize((s, s), Image.LANCZOS) for s in sizes]
    imgs[0].save(
        output_path, format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=imgs[1:],
    )


def generate_webmanifest():
    manifest = {
        "name": "Adroit Consulting",
        "short_name": "Adroit",
        "icons": [
            {"src": "adroit-logo-fullcolor-64.png", "sizes": "64x64", "type": "image/png"},
            {"src": "adroit-logo-fullcolor-128.png", "sizes": "128x128", "type": "image/png"},
            {"src": "adroit-logo-fullcolor-256.png", "sizes": "256x256", "type": "image/png"},
            {"src": "adroit-logo-fullcolor-512.png", "sizes": "512x512", "type": "image/png"},
        ],
        "theme_color": "#004D98",
        "background_color": "#FFFFFF",
        "display": "standalone",
    }
    with open(ROOT / "web" / "site.webmanifest", "w") as f:
        json.dump(manifest, f, indent=2)


# ---------------------------------------------------------------------------
# Social assets
# ---------------------------------------------------------------------------

def generate_social(master):
    save_png(master, 400, ROOT / "social" / "adroit-social-profile-400.png")
    save_png(master, 800, ROOT / "social" / "adroit-social-profile-800.png")

    og_w, og_h = 1200, 630
    og = Image.new("RGBA", (og_w, og_h), NAVY + (255,))

    accent_bar_height = 6
    accent = Image.new("RGBA", (og_w, accent_bar_height), CARMINE + (255,))
    og.paste(accent, (0, 0))
    og.paste(accent, (0, og_h - accent_bar_height))

    card_w, card_h = 380, 380
    card = Image.new("RGBA", (card_w, card_h), WHITE + (255,))
    logo = master.resize((320, 320), Image.LANCZOS)
    pad = (card_w - 320) // 2
    card.paste(logo, (pad, pad), logo)
    card_x = (og_w - card_w) // 2
    card_y = (og_h - card_h) // 2
    og.paste(card, (card_x, card_y))

    og.convert("RGB").save(
        ROOT / "social" / "adroit-og-image-1200x630.png", "PNG", optimize=True,
    )


# ---------------------------------------------------------------------------
# Email signature
# ---------------------------------------------------------------------------

def generate_email_signature(master):
    for target_w, name in [
        (320, "adroit-logo-email-320w.png"),
        (640, "adroit-logo-email-2x-640w.png"),
    ]:
        ratio = target_w / master.width
        target_h = int(master.height * ratio)
        resized = master.resize((target_w, target_h), Image.LANCZOS)
        resized.save(ROOT / "email-signature" / name, "PNG", optimize=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ensure_dirs()

    master = build_master()

    print("\nGenerating web PNGs...")
    generate_web_pngs(master)

    print("Generating web SVGs...")
    generate_web_svgs(master)

    print("Generating favicon.ico...")
    create_ico(master, ROOT / "web" / "adroit-favicon.ico")

    print("Generating site.webmanifest...")
    generate_webmanifest()

    print("Generating social assets...")
    generate_social(master)

    print("Generating email signature assets...")
    generate_email_signature(master)

    print("\nAll assets generated:")
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in sorted(dirnames) if not d.startswith(("_", "."))]
        for f in sorted(filenames):
            if f.startswith((".", "_")) or f.endswith(".py"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, f), ROOT)
            size = os.path.getsize(os.path.join(dirpath, f))
            print(f"  {rel}  ({size:,} bytes)")


if __name__ == "__main__":
    main()
