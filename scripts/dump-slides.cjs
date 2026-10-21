const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(7000);
  const cur = await page.evaluate(() => localStorage.getItem('adpilot.projects.current'));
  const proj = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'adpilot.project.' + cur);
  const car = proj.elements.find((e) => e.type === 'carousel');
  console.log('config:', JSON.stringify({ ...car.config, slides: undefined }, null, 1));
  car.config.slides.forEach((s, i) => console.log(`slide${i}:`, JSON.stringify({ t: s.title, p: s.price, op: s.oldPrice, cta: s.ctaLabel, url: (s.url || '').slice(0, 60) })));
  await browser.close();
})();
