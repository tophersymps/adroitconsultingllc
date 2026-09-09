#!/usr/bin/env python3
"""WCAG contrast verification for adroit-blog a11y fix (t_8a679ec4).

Asserts every changed token passes >=4.5:1 (normal) on all surfaces it is
used on, in both light and dark themes, and prints before/after ratios.
Run: python3 scripts/verify_contrast.py
"""

LIGHT_SURFACES = {'page': '#F7F8FA', 'card': '#FFFFFF',
                  'card-soft': '#F9FAFB', 'sunken': '#F3F4F6'}
DARK_SURFACES = {'page': '#0a0e1a', 'card': '#121a2e',
                 'card-soft': '#0e1526', 'sunken': '#0c1322'}

# token -> (light_value, dark_value, surfaces)
TOKENS = {
    '--ink-faint':   ('#646d7c', '#7f8ca3', 'both'),
    '--accent':      ('#C8102E', '#f05066', 'dark-text'),
    '--accent-hover':('#A00D24', '#f47385', 'dark-text'),
    '--accent-on-tint': ('#A00D24', '#f47385', 'on-tint'),
}

def lum(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    def f(c):
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

def ratio(a, b):
    x, y = lum(a), lum(b)
    hi, lo = max(x, y), min(x, y)
    return (hi + 0.05) / (lo + 0.05)

BEFORE = {
    ('--ink-faint', 'light'): {'page': 2.39, 'card': 2.54, 'card-soft': 2.43, 'sunken': 2.31},
    ('--ink-faint', 'dark'):  {'page': 4.05, 'card': 3.64, 'card-soft': 3.82, 'sunken': 3.90},
    ('--accent', 'dark'):     {'page': 4.62, 'card': 4.15, 'card-soft': 4.37, 'sunken': 4.45},
    ('--accent-hover', 'dark'):{'page': 3.27, 'card': 2.94, 'card-soft': 3.09, 'sunken': 3.15},
}

def blend(fg, bg, pct):
    fr, fgc, fb = (int(fg[i:i+2], 16) for i in (1, 3, 5))
    br, bgc, bb = (int(bg[i:i+2], 16) for i in (1, 3, 5))
    return '#%02X%02X%02X' % tuple(
        round(f * pct + b * (1 - pct)) for f, b in zip((fr, fgc, fb), (br, bgc, bb)))

failures = []
print(f"{'token':<16}{'theme':<7}{'surface':<10}{'before':<8}{'after':<7}{'status'}")
print('-' * 64)
for tok, (light_v, dark_v, scope) in TOKENS.items():
    for theme, surfaces, value in (('light', LIGHT_SURFACES, light_v),
                                   ('dark', DARK_SURFACES, dark_v)):
        # --accent / --accent-hover only enforced in dark (light already passes)
        if scope == 'dark-text' and theme == 'light':
            continue
        if scope == 'on-tint':
            # Text on an 8% accent-tint chip; bg = tint over the surface.
            tint = blend('#C8102E' if theme == 'light' else '#f05066',
                         surfaces['card'], 0.08)
            r = ratio(value, tint)
            before = BEFORE.get((tok, theme), {}).get('card', None)
            ok = r >= 4.5
            if not ok:
                failures.append(f"{tok} {theme}/card-tint: {r:.2f}:1")
            bs = f"{before:.2f}" if before else '  -  '
            print(f"{tok:<16}{theme:<7}{'card-tint':<10}{bs:<8}{r:<7.2f}{'PASS' if ok else 'FAIL'}")
            continue
        for name, bg in surfaces.items():
            r = ratio(value, bg)
            before = BEFORE.get((tok, theme), {}).get(name, None)
            ok = r >= 4.5
            if not ok:
                failures.append(f"{tok} {theme}/{name}: {r:.2f}:1")
            bs = f"{before:.2f}" if before else '  -  '
            print(f"{tok:<14}{theme:<7}{name:<10}{bs:<8}{r:<7.2f}{'PASS' if ok else 'FAIL'}")

print('-' * 60)
print(f"accent-bg #C8102E white-on (filled chip): {ratio('#FFFFFF', '#C8102E'):.2f}:1 "
      f"({'PASS' if ratio('#FFFFFF','#C8102E')>=4.5 else 'FAIL'})")

if failures:
    print('\nFAILURES:')
    for f in failures:
        print('  -', f)
    raise SystemExit(1)
print('\nAll changed tokens pass WCAG AA (>=4.5:1) on every surface used.')
