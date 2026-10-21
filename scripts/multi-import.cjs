const { chromium } = require('playwright-core');
const folders = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const folder of folders) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.locator('button:has-text("Open")').first().click();
      await page.locator('input[webkitdirectory]').setInputFiles(folder);
      await page.waitForTimeout(6000);
      const cur = await page.evaluate(() => localStorage.getItem('adpilot.projects.current'));
      const proj = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'adpilot.project.' + cur);
      console.log('\n=== ' + folder.split(/[\/]/).pop());
      proj.elements.forEach((e, i) => console.log(` ${i}: ${e.type} "${(e.name||'').slice(0,20)}" (${e.x},${e.y} ${e.width}x${e.height}) vis=${e.visible}`));
    } catch (e) { console.log(folder, 'FAILED', e.message); }
    await page.close();
  }
  await browser.close();
})();
