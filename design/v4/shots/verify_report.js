const { chromium } = require('/Users/kelex/.hermes/hermes-agent/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/kelex/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:8791/reports/design-system-admin-v4.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const imgs = await page.evaluate(() => {
    const all = Array.from(document.images);
    return { total: all.length, broken: all.filter(i => !i.complete || i.naturalWidth === 0).length, sections: document.querySelectorAll('section').length };
  });
  console.log(JSON.stringify(imgs));
  await page.screenshot({ path: '/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog/design/v4/shots/report.png', fullPage: true });
  console.log('report screenshot saved');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
