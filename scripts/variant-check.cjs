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
  await page.waitForTimeout(8000);
  // open Variant dialog, pick 300x250
  await page.locator('button:has-text("Variant")').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'scripts/variant-dialog.png' });
  await page.locator('.size-opt', { hasText: '300 × 250' }).click();
  await page.waitForTimeout(800);
  const cur = await page.evaluate(() => localStorage.getItem('adpilot.projects.current'));
  const proj = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'adpilot.project.' + cur);
  console.log('variant:', proj.name, proj.artboard.width + 'x' + proj.artboard.height);
  proj.elements.forEach((e, i) => console.log(` ${i}: ${e.type} "${(e.name || '').slice(0, 18)}" (${e.x},${e.y} ${e.width}x${e.height}) vis=${e.visible} fs=${e.fontSize ?? '-'}`));
  await page.screenshot({ path: 'scripts/variant-canvas.png' });
  await browser.close();
})();
