const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('console', m => console.log('[pg]', m.text()));
  page.on('pageerror', e => console.log('[err]', e.message));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const out = await page.evaluate(async () => {
    try {
      const mod = await import('/src/store/projectStore.ts');
      const { useEditor } = mod;
      const defs = await import('/src/model/defaults.ts');
      const st = useEditor.getState();
      st.newProject('guides-test', 300, 250);
      const a = defs.createElement('shape', 300, 250); a.x = 20; a.y = 20;
      useEditor.getState().addElement(a);
      const s2 = useEditor.getState();
      return { name: s2.project.name, els: s2.project.elements.length, sel: s2.selectedId };
    } catch (e) { return { err: String(e) }; }
  });
  console.log('result:', JSON.stringify(out));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'scripts/guides-panel.png' });
  await browser.close();
})();
