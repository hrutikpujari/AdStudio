const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const out = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return {
      keys,
      cur: localStorage.getItem('adpilot.projects.current'),
      idx: localStorage.getItem('adpilot.projects.index'),
    };
  });
  console.log(JSON.stringify(out, null, 1).slice(0, 800));
  await browser.close();
})();
