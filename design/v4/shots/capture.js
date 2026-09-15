const { chromium } = require('/Users/kelex/.hermes/hermes-agent/node_modules/playwright');

const BASE = 'http://localhost:8791';
const SHOTS = '/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/design/v4/shots';
const TARGETS = [
  ['mockup-admin-dashboard.html', 'dashboard'],
  ['mockup-admin-analytics.html', 'analytics'],
  ['mockup-admin-avatar-menu.html', 'avatar'],
  ['mockup-admin-launch-confirm.html', 'launch'],
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/kelex/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  for (const [fname, base] of TARGETS) {
    await page.goto(`${BASE}/${fname}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: `${SHOTS}/${base}-light.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${base}-dark.png`, fullPage: true });
    console.log('done ' + base);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
