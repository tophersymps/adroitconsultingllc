#!/usr/bin/env python3
import json
d = json.load(open('/tmp/lh-blog.json'))
# LCP element
lcp = d['audits'].get('largest-contentful-paint-element')
if lcp:
    for item in lcp.get('details',{}).get('items',[])[:3]:
        print("LCP element:", item.get('node',{}).get('snippet','')[:200])
# top byte-weight items
tbw = d['audits'].get('total-byte-weight',{}).get('details',{}).get('items',[])
print("\nTop byte-weight items:")
for it in sorted(tbw, key=lambda x:-x.get('totalBytes',0))[:8]:
    print(f"  {it.get('totalBytes',0)/1024:7.1f} KB  {it.get('url','')[:90]}")
# third-party / render-blocking
for a in ['render-blocking-resources','unused-javascript','third-party-summary','uses-optimized-images','modern-image-formats']:
    if a in d['audits']:
        print(f"\n{a}: {d['audits'][a].get('displayValue','')}")
