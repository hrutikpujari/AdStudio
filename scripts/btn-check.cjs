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
  const cur = await page.evaluate(() => localStorage.getItem('adpilot.projects.current'));
  const proj = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'adpilot.project.' + cur);
  console.log('elements in order (bottom->top):');
  proj.elements.forEach((e, i) => console.log(` ${i}: ${e.type} "${(e.name||'').slice(0,24)}" (${e.x},${e.y} ${e.width}x${e.height})${e.type==='button' ? ` label="${e.label}" bg=${e.background}` : ''}`));
  // crop artboard area around the carousel/nav
  await page.screenshot({ path: 'scripts/zoom.png', clip: { x: 540, y: 460, width: 370, height: 260 } });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
