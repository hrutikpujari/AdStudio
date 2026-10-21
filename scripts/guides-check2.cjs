const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const { useEditor } = await import('/src/store/projectStore.ts');
    const { createElement } = await import('/src/model/defaults.ts');
    const st = useEditor.getState();
    st.newProject('guides-test', 300, 250);
    const a = createElement('shape', 300, 250); a.x = 20; a.y = 20;
    const b = createElement('shape', 300, 250); b.x = 180; b.y = 150;
    useEditor.getState().addElement(a);
    useEditor.getState().addElement(b);
    useEditor.getState().select(b.id);
  });
  await page.waitForTimeout(400);
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('.panel-right button')].map(b => b.title || b.textContent.trim()).slice(0, 30));
  console.log('right panel buttons:', JSON.stringify(titles));
  const sel = await page.evaluate(async () => {
    const { useEditor } = await import('/src/store/projectStore.ts');
    return useEditor.getState().selectedId;
  });
  console.log('selected:', sel);
  await page.screenshot({ path: 'scripts/guides-panel.png' });
  await browser.close();
})();
