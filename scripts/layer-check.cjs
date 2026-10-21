const { chromium } = require('playwright-core');
const folder = process.argv[2];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(folder);
  await page.waitForTimeout(6000);
  await page.click('.rail-btn[title=Layers]');
  await page.waitForTimeout(400);
  // dump layer rows in visual order
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.layer-row')].map((r) => r.textContent.trim().slice(0, 40)));
  console.log('layer rows (top to bottom):', JSON.stringify(rows, null, 1));
  await page.screenshot({ path: 'scripts/layers.png' });
  // element stacking on canvas
  const stacking = await page.evaluate(() =>
    [...document.querySelectorAll('.ce')].map((e) => ({
      name: e.getAttribute('data-name') || e.className,
      z: getComputedStyle(e).zIndex,
      top: e.getBoundingClientRect().top,
    })));
  console.log(JSON.stringify(stacking, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
