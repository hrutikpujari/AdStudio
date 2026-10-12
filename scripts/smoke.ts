import { TEMPLATES, createElement, createProject } from '../src/model/defaults';
import { generateHtml } from '../src/export/generateHtml';
import { validateForExport } from '../src/export/validate';
import { validateProject } from '../src/model/schema';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { TextElement } from '../src/model/types';

const outDir = 'dist-smoke';
mkdirSync(outDir, { recursive: true });

// 1. every template builds a valid project + generates HTML
for (const t of TEMPLATES) {
  const p = t.build();
  const v = validateProject(JSON.parse(JSON.stringify(p)));
  if (!v.ok) {
    console.log(`✗ template ${t.id} INVALID:`, v.errors);
    process.exit(1);
  }
  const issues = validateForExport(p);
  const html = generateHtml(p, () => '');
  writeFileSync(`${outDir}/tpl-${t.id}.html`, html);
  console.log(`✓ ${t.id}: ${html.length}b html, ${issues.length} validation notes`);
}

// 2. manual project with basic elements + animations
const p = createProject('Smoke Test', 300, 250);
const text = createElement('text', 300, 250, { x: 40, y: 20 }) as TextElement;
text.content = 'SALE <b>50%</b> & "more"'; // escaping check
text.animation = { ...text.animation, preset: 'slide-in-top', delay: 200, duration: 600 };
const cta = createElement('button', 300, 250, { x: 90, y: 200 });
const car = createElement('carousel', 300, 250, { x: 0, y: 80 });
const cube = createElement('cube', 300, 250, { x: 75, y: 50 });
const fan = createElement('fan-carousel', 300, 250, { x: 0, y: 100 });
const vs = createElement('vertical-slider', 300, 250, { x: 30, y: 60 });
const cs = createElement('card-stack', 300, 250, { x: 20, y: 60 });
const spot = createElement('spotlight', 300, 250);
p.elements = [car, spot, text, cta];
const html = generateHtml(p, () => '');
writeFileSync(`${outDir}/manual.html`, html);
console.log(`✓ manual: ${html.length}b`);

// every component type in one project
const all = createProject('All Components', 300, 600);
all.elements = [car, cs, fan, cube, vs, spot];
const allHtml = generateHtml(all, () => '');
writeFileSync(`${outDir}/all-components.html`, allHtml);
console.log(`✓ all components: ${allHtml.length}b`);

// 3. scrub variant
const scrub = generateHtml(p, () => '', { scrubMs: 400 });
if (!scrub.includes('animation-play-state:paused')) {
  console.log('✗ scrub mode did not emit paused animations');
  process.exit(1);
}
console.log('✓ scrub mode emits paused animations');

// 4. zip round-trip: export -> project.json -> import restore
const { buildCreativeZip } = await import('../src/export/exportZip');
const JSZip = (await import('jszip')).default;
const tpl = TEMPLATES[0].build();
const blob = await buildCreativeZip(tpl);
const buf = new Uint8Array(await blob.arrayBuffer());
const rezip = await JSZip.loadAsync(buf);
const files = Object.keys(rezip.files);
if (!files.includes('index.html') || !files.includes('project.json') || !files.includes('README.txt')) {
  console.log('✗ zip missing files:', files);
  process.exit(1);
}
const pj = JSON.parse(await rezip.file('project.json')!.async('string'));
const rt = validateProject(pj);
if (!rt.ok || rt.project.name !== tpl.name || rt.project.elements.length !== tpl.elements.length) {
  console.log('✗ round-trip mismatch');
  process.exit(1);
}
console.log('✓ zip export + project.json round-trip restores', rt.project.elements.length, 'elements');

// 5. validation catches bad URL
const bad = createProject('Bad', 300, 250);
const btn = createElement('button', 300, 250) as any;
btn.url = 'javascript:alert(1)';
bad.elements = [btn];
const issues2 = validateForExport(bad);
if (!issues2.some((i) => i.level === 'error')) {
  console.log('✗ validator missed invalid button URL');
  process.exit(1);
}
console.log('✓ validator flags invalid button URL');
console.log('ALL SMOKE TESTS PASSED');
