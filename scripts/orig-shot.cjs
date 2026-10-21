const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  const f = 'file:///' + process.argv[2].replace(/\\/g, '/');
  await page.goto(f, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => {
    const c = document.querySelector('.ad-container').getBoundingClientRect();
    const nav = document.querySelector('.slider-nav').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.slider-btn')].map(b => {
      const r = b.getBoundingClientRect();
      return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
    });
    const card = document.querySelector('.video_slider_card').getBoundingClientRect();
    const cont = document.querySelector('.slider-container').getBoundingClientRect();
    return {
      nav: { x: nav.left - c.left, y: nav.top - c.top, w: nav.width, h: nav.height },
      btns,
      card: { x: card.left - c.left, y: card.top - c.top, w: card.width, h: card.height },
      cont: { x: cont.left - c.left, y: cont.top - c.top, w: cont.width, h: cont.height },
    };
  });
  console.log(JSON.stringify(m, null, 1));
  await page.screenshot({ path: 'scripts/orig.png', clip: { x: 50, y: 50, width: 300, height: 600 } });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
