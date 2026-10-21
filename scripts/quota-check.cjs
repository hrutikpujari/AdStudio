const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  // seed index with 2 big fake "old projects" (~2.3MB each = ~4.6MB total)
  await page.evaluate(() => {
    const junk = (mb) => 'x'.repeat(mb * 1024 * 1024);
    const mk = (id, name) => ({
      schemaVersion: 1, id, name,
      artboard: { width: 300, height: 250, backgroundColor: '#fff', backgroundFit: 'cover' },
      elements: [], clickTag: '', createdAt: Date.now(), updatedAt: Date.now() - 86400000,
      assets: [{ id: id + 'a', name: 'big.png', kind: 'image', mimeType: 'image/png', src: 'data:image/png;base64,' + btoa(junk(2.3)).slice(0, 2400000) }],
    });
    const p1 = mk('old1', 'Old Slider A'); p1.updatedAt = Date.now() - 40000;
    const p2 = mk('old2', 'Old Slider B'); p2.updatedAt = Date.now() - 20000;
    localStorage.setItem('adpilot.project.old1', JSON.stringify(p1));
    localStorage.setItem('adpilot.project.old2', JSON.stringify(p2));
    localStorage.setItem('adpilot.projects.index', JSON.stringify([
      { id: 'old1', name: 'Old Slider A', width: 300, height: 250, updatedAt: p1.updatedAt },
      { id: 'old2', name: 'Old Slider B', width: 300, height: 250, updatedAt: p2.updatedAt },
    ]));
    localStorage.setItem('adpilot.projects.current', 'old1');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const cur = async () => page.evaluate(() => localStorage.getItem('adpilot.projects.current'));
  const name = async () => page.evaluate(() => {
    const c = localStorage.getItem('adpilot.projects.current');
    const p = JSON.parse(localStorage.getItem('adpilot.project.' + c) || 'null');
    return p ? p.name : 'NONE';
  });
  console.log('loaded old project:', await name());
  // import a real creative — persist must evict old projects to fit
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(8000);
  console.log('after import:', await name(), '| persistFailed:', await page.evaluate(() => window.__pf ?? 'n/a'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  console.log('after refresh:', await name());
  const status = await page.locator('.tb-status').textContent().catch(() => 'n/a');
  console.log('toolbar status:', status);
  await browser.close();
})();
