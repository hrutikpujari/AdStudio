const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(6000);
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.ce')].map((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height, cls: e.className };
    }));
  console.log(JSON.stringify(boxes, null, 1));
  if (boxes.length >= 4) {
    const b = boxes[2];
    await page.screenshot({ path: 'scripts/zoom-prev.png', clip: { x: b.left - 25, y: b.top - 25, width: 90, height: 90 } });
    const n = boxes[3];
    await page.screenshot({ path: 'scripts/zoom-next.png', clip: { x: n.left - 25, y: n.top - 25, width: 90, height: 90 } });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
