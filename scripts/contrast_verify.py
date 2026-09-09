#!/usr/bin/env python3
"""Footer + final token verification for t_8a679ec4."""
def lum(h):
    h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16)/255 for i in (0,2,4))
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    x,y=lum(a),lum(b); hi,lo=max(x,y),min(x,y); return (hi+.05)/(lo+.05)
def comp(alpha, bg):
    c=[round(255*a+int(bg[i:i+2],16)*(1-a)) for i in (1,3,5)]
    return '#%02X%02X%02X'%tuple(c)
NAVY='#060F1F'
print("Footer muted text (navy #060F1F), need >=4.5:")
for a in [0.45,0.48,0.50,0.55]:
    col=comp(a,NAVY); print(f'  white/{int(a*100)}% -> {col}  {ratio(col,NAVY):.2f}:1')
print()
# final token set checks
LIGHT={'page':'#F7F8FA','card':'#FFFFFF','card-soft':'#F9FAFB','sunken':'#F3F4F6'}
DARK={'page':'#0a0e1a','card':'#121a2e','card-soft':'#0e1526','sunken':'#0c1322'}
print("FINAL LIGHT --ink-faint #646d7c:", {n:round(ratio('#646d7c',b),2) for n,b in LIGHT.items()})
print("FINAL DARK  --ink-faint #7f8ca3:", {n:round(ratio('#7f8ca3',b),2) for n,b in DARK.items()})
print("FINAL DARK  --accent    #f05066:", {n:round(ratio('#f05066',b),2) for n,b in DARK.items()})
print("FINAL DARK  --accent-hover #f47385:", {n:round(ratio('#f47385',b),2) for n,b in DARK.items()})
print("FINAL accent-bg #C8102E white-on:", round(ratio('#FFFFFF','#C8102E'),2))
print()
# hierarchy check: ink-faint still lighter(dark: dimmer) than muted
print("LIGHT muted #4B5563 vs faint #646d7c (faint must be LIGHTER -> higher lum):", lum('#646d7c'), lum('#4B5563'))
print("DARK  muted #94a3b8 vs faint #7f8ca3 (faint dimmer -> lower lum):", lum('#7f8ca3'), lum('#94a3b8'))

print()
print("=== SocialIcon glyph (text-white/40 on white/8 circle over navy) ===")
def comp(a_fg, a_alpha, bg):
    fg=(int(a_fg[i:i+2],16) for i in (1,3,5)); b=(int(bg[i:i+2],16) for i in (1,3,5))
    # white/8 over navy first
    circ=[round(255*0.08+int(NAVY[i:i+2],16)*0.92) for i in (1,3,5)]
    circ='#%02X%02X%02X'%tuple(circ)
    gly=[round(255*0.40+c*0.60) for c in circ] if False else None
    return circ
c=comp(None,0,NAVY)
print("circle bg:", c)
# white at 40% over circle
gly=[round(255*0.40+int(c[i:i+2],16)*0.60) for i in (1,3,5)]
gly='#%02X%02X%02X'%tuple(gly)
print("glyph color:", gly, "on circle", c, "=", round(ratio(gly,c),2), ":1")

print("=== Footer final: white/50 on circle vs navy ===")
for a,label in [(0.50,'white/50 glyph on circle')]:
    circ=[round(255*0.08+int(NAVY[i:i+2],16)*0.92) for i in (1,3,5)]
    circ='#%02X%02X%02X'%tuple(circ)
    gly=[round(255*a+int(circ[i:i+2],16)*(1-a)) for i in (1,3,5)]
    gly='#%02X%02X%02X'%tuple(gly)
    print(' ',label,gly,'on',circ,'=',round(ratio(gly,circ),2))
