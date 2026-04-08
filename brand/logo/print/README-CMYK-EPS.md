# Print Assets — CMYK EPS Production Notes

## Included Files

| File | Description |
|------|-------------|
| `adroit-logo-print-300dpi-2000px.png` | Full-color, 300 DPI, 2000x2000px (~6.67 in), transparent background |
| `adroit-logo-mono-black-300dpi-2000px.png` | Single-color black, 300 DPI, for limited-color print |
| `adroit-logo-mono-white-300dpi-2000px.png` | Single-color white (on transparent), for dark print backgrounds |

## CMYK EPS Files — Manual Production Required

The following EPS files listed in the Logo Deliverables Pack require Adobe Illustrator (or equivalent vector software) to produce, since they need proper RGB-to-CMYK color conversion with proofing:

- `adroit-logo-cmyk-fullcolor.eps`
- `adroit-logo-cmyk-black.eps`
- `adroit-logo-cmyk-white-reverse.eps`

### How to Produce

1. Open `adroit-logo-print-300dpi-2000px.png` (or the 1024px master from `source/`) in Adobe Illustrator.
2. Use **Image Trace** (High Fidelity Photo or 6 Colors) to vectorize, or place as an embedded raster if vector is not required.
3. Convert the document color mode to **CMYK** (File > Document Color Mode > CMYK).
4. Proof the CMYK output against the approved brand colors to confirm fidelity.
5. Save As **EPS** (Illustrator EPS, version 10+ for compatibility).
6. Repeat for the black and white-reverse variants using the corresponding mono PNGs.

### Recommended CMYK Values

| Color | Approx CMYK |
|-------|-------------|
| Pewter Gray (~#585858) | C:0 M:0 Y:0 K:75 |
| Steel Blue (~#465D73) | C:65 M:35 Y:15 K:25 |
| Brick Red (~#964848) | C:15 M:70 Y:60 K:15 |
| Black | C:0 M:0 Y:0 K:100 |
| White (reverse) | Paper / knockout |

These values are approximate starting points. Always proof on the target print stock before final production.
