const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const name = async () => page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const p = JSON.parse(localStorage.getItem('adpilot.project.' + cur) || 'null');
    return p ? p.name : 'NONE';
  });
  // import slice
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(6000);
  console.log('after slice import:', await name());
  // import video creative on top
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[3]);
  await page.waitForTimeout(8000);
  console.log('after V2 import:', await name());
  // refresh — should still be the V2 creative
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  console.log('after refresh:', await name());
  const elems = await page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const p = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    return p.elements.map((e) => `${e.type}(${e.x},${e.y})`).join(' ');
  });
  console.log('elements:', elems);
  await browser.close();
})();
