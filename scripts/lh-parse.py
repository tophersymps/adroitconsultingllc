#!/usr/bin/env python3
import json
d = json.load(open('/tmp/lh-blog.json'))
print("Performance score:", d['categories']['performance']['score']*100)
for a in ['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index','interactive']:
    if a in d['audits']:
        print(f"{a}: {d['audits'][a]['displayValue']}")
for a in ['total-byte-weight','network-requests','mainthread-work-breakdown']:
    if a in d['audits']:
        print(f"{a}: {d['audits'][a]['displayValue']}")
