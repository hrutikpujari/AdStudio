const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.log('[err]', e.message));
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
  const st0 = await page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    return { name: proj.name, els: proj.elements.map(e => ({ id: e.id, n: e.name, x: e.x, y: e.y, w: e.width, h: e.height })) };
  });
  console.log('project:', JSON.stringify(st0));
  const board = await page.locator('.artboard').boundingBox();
  const zoom = board.width / 300;
  const clickEl = async (e) => {
    await page.mouse.click(board.x + (e.x + e.w / 2) * zoom, board.y + (e.y + e.h / 2) * zoom);
    await page.waitForTimeout(250);
  };
  const posOf = async () => page.evaluate(() => {
    const cur = localStorage.getItem('adpilot.projects.current');
    const proj = JSON.parse(localStorage.getItem('adpilot.project.' + cur));
    return proj.elements.map(e => ({ n: e.name, x: e.x, y: e.y }));
  });

  // --- nudge: click element b to select it, then arrows ---
  const b = st0.els[1];
  await clickEl(b);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1200); // let save debounce + gesture close
  let els = await posOf();
  console.log('after nudge x2+down:', JSON.stringify(els.find(e => e.n === 'b')), '(from 180,150 → expect 182,151)');
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
  await page.waitForTimeout(1200);
  els = await posOf();
  console.log('after shift+left:', JSON.stringify(els.find(e => e.n === 'b')), '(expect x=172)');

  // --- align buttons ---
  const btns = await page.evaluate(() => [...document.querySelectorAll('button[title]')].map(b => b.title).filter(t => /align|center/i.test(t)));
  console.log('align buttons:', JSON.stringify(btns));
  await page.locator('button[title="Center horizontally"]').click();
  await page.locator('button[title="Center vertically"]').click();
  await page.waitForTimeout(1200);
  els = await posOf();
  console.log('after center:', JSON.stringify(els.find(e => e.n === 'b')));
  await page.screenshot({ path: 'scripts/guides-align.png' });

  // --- snap: drag element a so its left edge approaches x=150 (artboard center) ---
  const a = st0.els[0];
  const grabX = board.x + (a.x + a.w / 2) * zoom;
  const grabY = board.y + (a.y + a.h / 2) * zoom;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + (147 - a.x) * zoom, grabY, { steps: 8 });
  await page.waitForTimeout(400);
  const snap = await page.evaluate(() => {
    const sel = document.querySelector('.ce.selected');
    return {
      guides: document.querySelectorAll('.snap-guide').length,
      selLeft: sel ? sel.getBoundingClientRect().left : null,
    };
  });
  console.log('snap:', JSON.stringify(snap), '(expect guides>0)');
  await page.screenshot({ path: 'scripts/guides-snap.png' });
  await page.mouse.up();
  await page.waitForTimeout(800);
  els = await posOf();
  console.log('after drag:', JSON.stringify(els.find(e => e.n === 'a')));
  await browser.close();
})();
