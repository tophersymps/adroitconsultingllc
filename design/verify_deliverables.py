#!/usr/bin/env python3
"""Static verification for design deliverables (design-only task — no npm build allowed per task constraints)."""
import json, html.parser, sys, os

os.chdir('/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog')

class P(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
        self.void = {'img','br','hr','meta','link','input','circle','path','source','wbr','area','base','col','embed','track'}
    def handle_starttag(self, tag, attrs):
        if tag not in self.void:
            self.stack.append((tag, self.getpos()))
    def handle_endtag(self, tag):
        if tag in self.void:
            return
        if not self.stack:
            self.errors.append(f'line {self.getpos()[0]}: closing </{tag}> with empty stack')
            return
        open_tag, pos = self.stack.pop()
        if open_tag != tag:
            self.errors.append(f'line {self.getpos()[0]}: expected </{open_tag}> (opened line {pos[0]}), got </{tag}>')

ok = True
for f in ['design/mockup-blog-listing.html','design/mockup-post-detail.html','design/mockup-learn-hub.html','design/mockup-categories.html','design/mockup-tags.html','design/design-system.html']:
    p = P()
    p.feed(open(f).read())
    leftover = [t for t,_ in p.stack]
    if not p.errors and not leftover:
        print(f'PASS {f}')
    else:
        ok = False
        print(f'FAIL {f}: errors={p.errors[:4]} unclosed={leftover[:4]}')

# JSON metadata valid?
try:
    json.load(open('design/complete-metadata.json'))
    print('PASS design/complete-metadata.json (valid JSON)')
except Exception as e:
    ok = False
    print(f'FAIL design/complete-metadata.json: {e}')

# CSS braces balanced in tokens file?
css = open('design/design-tokens.css').read()
if css.count('{') == css.count('}'):
    print('PASS design/design-tokens.css (balanced braces)')
else:
    ok = False
    print(f"FAIL design/design-tokens.css: {css.count('{')} open vs {css.count('}')} close")

# Imagery gate: every mockup embeds real <img> or background-image
import re
for f in ['design/mockup-blog-listing.html','design/mockup-post-detail.html','design/mockup-learn-hub.html','design/mockup-categories.html','design/mockup-tags.html']:
    src = open(f).read()
    base = os.path.dirname(f)
    imgs = re.findall(r'<img[^>]*src="([^"]+)"', src)
    missing = [i for i in imgs if not i.startswith('http') and not os.path.exists(os.path.join(base, i))]
    if imgs and not missing:
        print(f'PASS {f} imagery gate ({len(imgs)} embedded images)')
    else:
        ok = False
        print(f'FAIL {f} imagery gate: imgs={imgs} missing={missing}')

print('RESULT:', 'ALL PASS' if ok else 'FAILURES PRESENT')
sys.exit(0 if ok else 1)
