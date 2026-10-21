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
  const els = await page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    return proj.elements.map(e => ({
      n: e.name, t: e.type, vis: e.visible,
      anim: e.animation?.preset !== 'none' ? `${e.animation.preset}@${e.animation.delay}+${e.animation.duration}` : '-',
    }));
  });
  console.log(JSON.stringify(els, null, 0));
  const html = await page.evaluate(async () => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    const mod = await import('/src/export/generateHtml.ts');
    const amap = new Map((proj.assets || []).map(a => [a.id, a.src || '']));
    return mod.generateHtml(proj, (id) => (id ? amap.get(id) || '' : ''));
  });
  await browser.close();
  // render export at t=1s (screen1) and t=5s (screen2)
  const b2 = await chromium.launch({ channel: 'msedge', headless: true });
  const p2 = await b2.newPage({ viewport: { width: 320, height: 620 } });
  await p2.setContent(html);
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: 'scripts/pane-t1.png' });
  await p2.waitForTimeout(3500);
  await p2.screenshot({ path: 'scripts/pane-t5.png' });
  await b2.close();
})();
