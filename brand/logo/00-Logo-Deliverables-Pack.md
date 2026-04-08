# Logo Deliverables Pack

> The Adroit Consulting logo mark remains **unchanged**. This document specifies the production-ready asset variants, naming conventions, and usage guidelines needed to deploy the logo across all website and marketing channels.

---

## Source Reference

- **Input file:** `AC_Logo_120sq.png`
- **Instruction:** Logo shape, design, and proportions are preserved exactly. Only format, size, and background treatment variants are produced.

---

## Folder Structure

```
brand/logo/
├── source/          — Master vector files and original archive
├── web/             — SVG and PNG variants for website use (canonical; also copied to apps/web/public for the Next.js app)
├── social/          — Profile images and Open Graph assets
├── print/           — CMYK-ready files for printed materials
├── email-signature/ — Optimized PNGs for email clients
└── guidelines/      — Usage rules and clear-space guidance
```

---

## Asset Manifest

### `source/`

| File | Description |
|------|-------------|
| `adroit-logo-master.svg` | Vector master — all other assets derive from this |
| `adroit-logo-master.ai` | Adobe Illustrator source (if available from designer) |
| `adroit-logo-master.pdf` | Vector interchange format |
| `ac_logo_120sq_original.png` | Unaltered source archive — original file preserved |

### `web/`

| File | Description |
|------|-------------|
| `adroit-logo-fullcolor-lightbg.svg` | Full-color logo on transparent/light backgrounds |
| `adroit-logo-fullcolor-darkbg.svg` | Full-color logo optimized for dark backgrounds |
| `adroit-logo-monochrome-navy.svg` | Single-color navy variant (`#004D98`) |
| `adroit-logo-monochrome-white.svg` | Single-color white variant for dark surfaces |
| `adroit-logo-fullcolor-512.png` | PNG — 512×512px, transparent background |
| `adroit-logo-fullcolor-256.png` | PNG — 256×256px, transparent background |
| `adroit-logo-fullcolor-128.png` | PNG — 128×128px, transparent background |
| `adroit-logo-fullcolor-64.png` | PNG — 64×64px, transparent background |
| `adroit-favicon-32.png` | Favicon — 32×32px |
| `adroit-favicon-16.png` | Favicon — 16×16px |
| `adroit-favicon.ico` | Multi-resolution ICO file (16 + 32 + 48) |
| `adroit-apple-touch-icon-180.png` | Apple touch icon — 180×180px |
| `site.webmanifest` | PWA icon mapping metadata |

### `social/`

| File | Description |
|------|-------------|
| `adroit-social-profile-400.png` | Social media profile image — 400×400px |
| `adroit-social-profile-800.png` | High-res social profile — 800×800px |
| `adroit-og-image-1200x630.png` | Open Graph / link preview image with logo on branded background |

### `print/`

| File | Description |
|------|-------------|
| `adroit-logo-cmyk-fullcolor.eps` | CMYK full-color for professional printing |
| `adroit-logo-cmyk-black.eps` | CMYK single-color black |
| `adroit-logo-cmyk-white-reverse.eps` | CMYK white/reverse for dark print backgrounds |
| `adroit-logo-print-300dpi-2000px.png` | High-resolution raster for print collateral |

### `email-signature/`

| File | Description |
|------|-------------|
| `adroit-logo-email-320w.png` | Standard resolution — 320px wide |
| `adroit-logo-email-2x-640w.png` | Retina resolution — 640px wide (displayed at 320px) |

---

## Production Notes

- **Export order:** Always generate raster assets from the vector master (`adroit-logo-master.svg`). Never upscale from `AC_Logo_120sq.png`.
- **Transparency:** All PNG assets use transparent backgrounds unless a solid-background variant is specifically required.
- **Web preference:** Use SVG for website rendering wherever possible. Fall back to PNG only for email clients and platforms that do not support SVG.
- **Compression:** Optimize PNGs with lossless compression (e.g., pngquant, ImageOptim). SVGs should be minified for production.
- **Color fidelity:** Ensure CMYK conversions are proofed against the approved brand palette before print production.
