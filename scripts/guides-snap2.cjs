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
    const a = createElement('shape', 300, 250); a.name = 'a'; a.x = 20; a.y = 20;
    const b = createElement('shape', 300, 250); b.name = 'b'; b.x = 180; b.y = 150;
    useEditor.getState().addElement(a);
    useEditor.getState().addElement(b);
    useEditor.getState().save();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const a = { x: 20, y: 20, width: 120, height: 80 };
  const board = await page.locator('.artboard').boundingBox();
  const zoom = board.width / 300;
  const grabX = board.x + (a.x + a.width / 2) * zoom;
  const grabY = board.y + (a.y + a.height / 2) * zoom;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  // left edge to ~149 (1px from center-line 150) → should snap to exactly 150
  // top edge to ~124 (1px from middle-line 125) → should snap to exactly 125
  await page.mouse.move(grabX + (149 - a.x) * zoom, grabY + (124 - a.y) * zoom, { steps: 10 });
  await page.waitForTimeout(400);
  const snap = await page.evaluate(() => ({
    guides: document.querySelectorAll('.snap-guide').length,
    guidePos: [...document.querySelectorAll('.snap-guide')].map(g => g.className + '@' + (g.style.left || g.style.top)),
  }));
  console.log('snap:', JSON.stringify(snap));
  await page.screenshot({ path: 'scripts/guides-snap.png' });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const pos = await page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const p = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    return { x: p.elements[0].x, y: p.elements[0].y };
  });
  console.log('final:', JSON.stringify(pos), '(expect 150,125 snapped)');
  await browser.close();
})();
