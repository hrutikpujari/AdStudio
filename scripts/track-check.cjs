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
  await page.waitForTimeout(8000);
  // export the project via the toolbar's buildCreativeZip path — easier: call generate via module
  const html = await page.evaluate(async () => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    const mod = await import('/src/export/generateHtml.ts');
    const amap = new Map((proj.assets || []).map((a) => [a.id, a.src || '']));
    return mod.generateHtml(proj, (id) => (id ? amap.get(id) || '' : ''));
  });
  await browser.close();
  // render the exported html at two timestamps
  const b2 = await chromium.launch({ channel: 'msedge', headless: true });
  const p2 = await b2.newPage({ viewport: { width: 320, height: 620 } });
  await p2.setContent(html);
  await p2.waitForTimeout(400);
  const tr1 = await p2.evaluate(() => document.querySelector('.cr-track')?.style.transform || getComputedStyle(document.querySelector('.cr-track')).transform);
  await p2.waitForTimeout(5500); // past first interval
  const tr2 = await p2.evaluate(() => document.querySelector('.cr-track')?.style.transform || getComputedStyle(document.querySelector('.cr-track')).transform);
  console.log('t=0.4s transform:', tr1);
  console.log('t=5.9s transform:', tr2);
  // click the next button — should navigate, not open URL
  await p2.locator('[data-nav="next"]').click();
  await p2.waitForTimeout(900);
  const tr3 = await p2.evaluate(() => document.querySelector('.cr-track')?.style.transform);
  console.log('after next click:', tr3);
  await p2.screenshot({ path: 'scripts/track-export.png' });
  await b2.close();
})();
