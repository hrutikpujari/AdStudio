const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'scripts/card-artboard.png' });
  // zoom into the carousel area
  const board = await page.locator('.artboard').boundingBox();
  const zoom = board.width / 300;
  await page.screenshot({
    path: 'scripts/card-zoom.png',
    clip: { x: board.x, y: board.y + 349 * zoom, width: 300 * zoom, height: 241 * zoom },
  });
  await browser.close();

  // original creative for comparison
  const b2 = await chromium.launch({ channel: 'msedge', headless: true });
  const p2 = await b2.newPage({ viewport: { width: 320, height: 620 } });
  const { pathToFileURL } = require('url');
  const path = require('path');
  const html = path.join(process.argv[2], 'index.html');
  await p2.goto(pathToFileURL(html).href);
  await p2.waitForTimeout(4800); // let screen transition + slider settle
  await p2.screenshot({ path: 'scripts/card-orig.png' });
  await b2.close();
})();
