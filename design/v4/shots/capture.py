#!/usr/bin/env python3
"""Capture light+dark screenshots of the v4 admin mockups with Playwright chromium."""
import sys, time, os
from playwright.sync_api import sync_playwright

CHROME = os.path.expanduser(
    "~/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/"
    "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
)
BASE = "http://localhost:8791"
SHOTS = os.path.expanduser("~/Documents/Fortress-of-Solitude/adroit-blog/design/v4/shots")

# (file, base-shot-name) — captures light + dark for each
TARGETS = [
    ("mockup-admin-dashboard.html", "dashboard"),
    ("mockup-admin-analytics.html", "analytics"),
    ("mockup-admin-avatar-menu.html", "avatar"),
    ("mockup-admin-launch-confirm.html", "launch"),
]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        page = browser.new_page(viewport={"width": 1360, "height": 900})
        for fname, base in TARGETS:
            page.goto(f"{BASE}/{fname}", wait_until="networkidle")
            time.sleep(0.6)
            # light
            page.emulate_media(color_scheme="light")
            page.screenshot(path=f"{SHOTS}/{base}-light.png", full_page=True)
            # dark
            page.emulate_media(color_scheme="dark")
            page.evaluate("document.documentElement.classList.add('dark')")
            time.sleep(0.4)
            page.screenshot(path=f"{SHOTS}/{base}-dark.png", full_page=True)
            print(f"done {base}")
        browser.close()

if __name__ == "__main__":
    main()
