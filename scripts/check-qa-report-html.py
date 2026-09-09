#!/usr/bin/env python3
"""Minimal HTML well-formedness check for QA report deliverables."""
import sys
from html.parser import HTMLParser

VOID = {'meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr'}

class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f'unexpected </{tag}> at {self.getpos()}')
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
        else:
            self.errors.append(f'mismatch: expected </{self.stack[-1][0]}> got </{tag}> at {self.getpos()}')

path = sys.argv[1]
c = Checker()
c.feed(open(path).read())
if c.stack:
    c.errors.append(f'unclosed tags: {[t for t, _ in c.stack]}')
if c.errors:
    print(f'FAIL {path}: ' + '; '.join(c.errors[:5]))
    sys.exit(1)
print(f'HTML well-formed: PASS ({path})')
