const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(7000);
  await page.locator('.artboard, .canvas-area, [class*="artboard"]').first().screenshot({ path: 'scripts/v2-artboard.png' }).catch(() => page.screenshot({ path: 'scripts/v2-artboard.png' }));
  await browser.close();
})();
