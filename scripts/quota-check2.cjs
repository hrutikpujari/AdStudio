const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
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
  await page.locator('button:has-text("Open")').first().click();
  await page.locator('input[webkitdirectory]').setInputFiles(process.argv[2]);
  await page.waitForTimeout(8000);
  const st = await page.evaluate(() => ({
    cur: localStorage.getItem('adpilot.projects.current'),
    idx: JSON.parse(localStorage.getItem('adpilot.projects.index') || '[]').map((m) => m.id + ':' + m.name),
    old1: !!localStorage.getItem('adpilot.project.old1'),
    old2: !!localStorage.getItem('adpilot.project.old2'),
    approx: Object.keys(localStorage).reduce((s, k) => s + (localStorage.getItem(k) || '').length, 0),
  }));
  console.log(JSON.stringify(st, null, 1));
  await browser.close();
})();
