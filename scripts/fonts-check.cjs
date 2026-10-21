const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.log('[err]', e.message));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // seed project with a text element
  await page.evaluate(async () => {
    const { useEditor } = await import('/src/store/projectStore.ts');
    const { createElement } = await import('/src/model/defaults.ts');
    const st = useEditor.getState();
    st.newProject('font-test', 300, 250);
    const t = createElement('text', 300, 250);
    t.name = 'txt'; t.x = 20; t.y = 60; t.width = 260; t.height = 50;
    if ('content' in t) t.content = 'Hello مرحبا';
    useEditor.getState().addElement(t);
    useEditor.getState().save();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // click the text element to select it (reveal Properties)
  const board = await page.locator('.artboard').boundingBox();
  const zoom = board.width / 300;
  await page.mouse.click(board.x + (20 + 130) * zoom, board.y + (60 + 25) * zoom);
  await page.waitForTimeout(300);

  // open the font picker, pick Cairo
  await page.locator('.fpick-btn').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'scripts/fonts-picker.png' });
  await page.locator('.fpick-search').fill('cairo');
  await page.waitForTimeout(150);
  await page.locator('.fpick-item:has-text("Cairo")').first().click();
  await page.waitForTimeout(1500); // font load

  const state = await page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    return {
      googleFonts: proj.googleFonts,
      fontFamily: proj.elements[0].fontFamily,
      link: document.getElementById('aps-gfonts')?.href || null,
      appliedFont: getComputedStyle(document.querySelector('.ce.selected .ce-inner *') || document.body).fontFamily,
    };
  });
  console.log('state:', JSON.stringify(state, null, 1));
  await page.screenshot({ path: 'scripts/fonts-applied.png' });

  // export check
  const html = await page.evaluate(async () => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    const mod = await import('/src/export/generateHtml.ts');
    const amap = new Map((proj.assets || []).map(a => [a.id, a.src || '']));
    return mod.generateHtml(proj, (id) => (id ? amap.get(id) || '' : ''));
  });
  console.log('export has gfonts link:', /fonts\.googleapis\.com\/css2\?family=Cairo/.test(html));
  console.log('export text uses Cairo:', /font-family:'Cairo'/.test(html));

  // font asset: simulate an uploaded font asset + verify @font-face emitted
  const face = await page.evaluate(async () => {
    const { useEditor } = await import('/src/store/projectStore.ts');
    useEditor.getState().addAsset({ name: 'MyBrand.woff2', kind: 'font', mimeType: 'font/woff2', src: 'data:font/woff2;base64,AAAA' });
    useEditor.getState().save();
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    const mod = await import('/src/export/generateHtml.ts');
    const amap = new Map((proj.assets || []).map(a => [a.id, a.src || '']));
    const h = mod.generateHtml(proj, (id) => (id ? amap.get(id) || '' : ''));
    return { exported: /@font-face\{font-family:'MyBrand'/.test(h), styleTag: (document.getElementById('aps-proj-fonts')?.textContent || '').includes('MyBrand') };
  });
  console.log('font asset faces:', JSON.stringify(face));
  await browser.close();
})();
