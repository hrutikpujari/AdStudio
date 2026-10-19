import JSZip from 'jszip';
import { validateProject } from '../model/schema';
import { createProject, uid } from '../model/defaults';
import { apsProbe } from './probeScript';
import type { ProbeResult } from './probeScript';
import type {
  AdElement,
  AssetRef,
  ButtonElement,
  CarouselElement,
  CreativeProject,
  ImageElement,
  ShapeElement,
  SliceFlipElement,
  SlideConfig,
  TextElement,
  VideoElement,
} from '../model/types';

/**
 * Creative importer — two fidelity levels:
 *
 *  'full'      — ZIPs produced by this exporter carry project.json;
 *                the document is validated and restored as-is.
 *  'flattened' — any other HTML creative: the file is rendered in a
 *                hidden sandboxed iframe (scripts disabled) and every
 *                visible node's real bounds are measured to synthesize
 *                flattened elements. JS-driven states collapse to the
 *                first frame; components do not survive as components.
 */

export interface ImportResult {
  ok: boolean;
  fidelity: 'full' | 'flattened';
  project?: CreativeProject;
  message: string;
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

function ext(p: string): string {
  return (p.split('.').pop() ?? '').toLowerCase();
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function basename(p: string): string {
  return normPath(p).split('/').pop() ?? p;
}

async function bytesToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as number[]);
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

function b64Text(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as number[]);
  }
  return btoa(bin);
}

/** Replace `"p"`, `'p'` and `(p)` occurrences of each candidate path —
 *  covers markup attributes, CSS url() and path literals inside
 *  <script> bodies (where creatives declare their image lists). */
function rewritePathLiterals(body: string, map: Map<string, string>): string {
  let out = body;
  for (const [p, du] of map) {
    for (const v of ['./' + p, p]) {
      out = out.split(`"${v}"`).join(`"${du}"`);
      out = out.split(`'${v}'`).join(`'${du}'`);
      out = out.split(`(${v})`).join(`(${du})`);
    }
  }
  return out;
}

/** Inline every local file reachable from the source as a data URL:
 *  images/fonts directly; css/js are decoded, their own path refs
 *  rewritten, then re-embedded. Returns the path->dataURL map and the
 *  combined css text (needed by the probe's style sniffing). */
async function inlineAssets(src: Source): Promise<{ map: Map<string, string>; cssText: string }> {
  const map = new Map<string, string>();
  const cssParts: string[] = [];
  for (const p of src.candidates()) {
    if (!IMG_EXT.test(p) && !FONT_EXT.test(p)) continue;
    const bytes = await src.getBytes(p);
    if (bytes) map.set(p, await bytesToDataUrl(bytes, MIME[ext(p)] ?? 'application/octet-stream'));
  }
  for (const p of src.candidates()) {
    if (!/\.(css|js)$/i.test(p)) continue;
    const bytes = await src.getBytes(p);
    if (!bytes) continue;
    let body = rewritePathLiterals(new TextDecoder().decode(bytes), map);
    // measurement must never depend on live network access — a remote
    // @font-face (e.g. Google Fonts) can stall/slow the probe's render
    // in a sandboxed iframe with no connectivity guarantee. Fonts don't
    // affect any geometry we track (px-sized boxes), so strip them here;
    // the real exported HTML is generated independently and never
    // carries this raw CSS forward.
    if (/\.css$/i.test(p)) body = body.replace(/@font-face\s*\{[^}]*\}/gi, '');
    if (/\.css$/i.test(p)) cssParts.push(body);
    map.set(p, `data:${/\.css$/i.test(p) ? 'text/css' : 'text/javascript'};base64,${b64Text(body)}`);
  }
  return { map, cssText: cssParts.join('\n') };
}

/* ------------------------------ ZIP path ---------------------------- */

export async function importZip(file: File): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, fidelity: 'flattened', message: 'Not a valid ZIP file' };
  }

  // 1. studio export → project.json round-trip
  const pj = zip.file('project.json');
  if (pj) {
    try {
      const parsed = JSON.parse(await pj.async('string'));
      const res = validateProject(parsed);
      if (res.ok) {
        // re-hydrate assets that live in imgs/ (exported zips store
        // data URLs already, so this is mainly forward-compat)
        return {
          ok: true, fidelity: 'full', project: res.project,
          message: `Restored "${res.project.name}" — fully editable`,
        };
      }
      return { ok: false, fidelity: 'full', message: `project.json failed validation: ${res.errors[0] ?? ''}` };
    } catch {
      return { ok: false, fidelity: 'full', message: 'project.json is corrupted' };
    }
  }

  // 2. foreign zip → html + extracted assets
  const htmlEntry = zip.file('index.html') ??
    Object.values(zip.files).find((f) => /\.html?$/i.test(f.name) && !f.dir);
  if (!htmlEntry) {
    return { ok: false, fidelity: 'flattened', message: 'No .html file found in ZIP' };
  }
  const html = await htmlEntry.async('string');
  const files = new Map<string, Uint8Array>();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (IMG_EXT.test(name) || FONT_EXT.test(name)) {
      files.set(normPath(name), await entry.async('uint8array'));
    }
  }
  return importHtml(html, {
    name: basename(htmlEntry.name).replace(/\.html?$/i, ''),
    getBytes: (p) => files.get(p) ?? null,
    candidates: () => [...files.keys()],
  });
}

/* ------------------------- folder / file path ----------------------- */

export async function importFolderFiles(list: FileList): Promise<ImportResult> {
  const raw = Array.from(list).map((f) => ({
    f,
    rel: normPath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name),
  }));
  // A folder pick prefixes every path with the selected folder's name; strip
  // that common leading segment so keys match the creative's relative refs.
  let prefix = '';
  const first = raw[0]?.rel ?? '';
  const cut = first.indexOf('/');
  if (cut > 0) {
    const head = first.slice(0, cut + 1);
    if (raw.length > 1 && raw.every((r) => r.rel.startsWith(head))) prefix = head;
  }
  const files = new Map<string, File>();
  let htmlFile: File | null = null;
  let htmlScore = Infinity;
  for (const { f, rel: full } of raw) {
    const rel = prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full;
    files.set(rel, f);
    if (/\.html?$/i.test(rel)) {
      const score = rel.toLowerCase() === 'index.html' ? 0 : rel.split('/').length;
      if (score < htmlScore) { htmlScore = score; htmlFile = f; }
    }
  }
  if (!htmlFile) {
    return { ok: false, fidelity: 'flattened', message: 'No .html file found in the folder' };
  }
  const html = await htmlFile.text();
  return importHtml(html, {
    name: htmlFile.name.replace(/\.html?$/i, ''),
    getBytes: (p) => {
      const f = files.get(p);
      return f ? f.arrayBuffer().then((b) => new Uint8Array(b)) : null;
    },
    candidates: () => [...files.keys()],
  });
}

export async function importHtmlFile(file: File): Promise<ImportResult> {
  return importHtml(await file.text(), {
    name: file.name.replace(/\.html?$/i, ''),
    getBytes: () => null,
    candidates: () => [],
  });
}

/* --------------------------- html flatten --------------------------- */

interface Source {
  name: string;
  /** resolve a normalized relative path to bytes, or null */
  getBytes: (path: string) => Promise<Uint8Array> | Uint8Array | null;
  candidates: () => string[];
}

/**
 * Live-DOM measurement: every local file is inlined into the document
 * (including path literals inside <script> bodies), our probe script is
 * appended, and the document runs in an opaque-origin sandboxed iframe
 * (`allow-scripts` only — the creative's JS executes and builds its real
 * DOM, but cannot reach the editor). The probe walks the live DOM and
 * postMessages serialized elements back. Returns null on timeout.
 */
async function runProbe(html: string, src: Source): Promise<ProbeResult | null> {
  const { map, cssText } = await inlineAssets(src);
  const inlined = rewritePathLiterals(html, map);
  const doc = new DOMParser().parseFromString(inlined, 'text/html');

  const base = doc.createElement('base');
  base.setAttribute('href', 'about:blank');
  doc.head.prepend(base);
  const freeze = doc.createElement('style');
  freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
  doc.head.appendChild(freeze);

  const styleText = [
    ...Array.from(doc.querySelectorAll('style')).map((s) => s.textContent ?? ''),
    cssText,
  ].join('\n');
  const cfgJson = JSON.stringify({
    html, styleText, pathMap: Object.fromEntries(map),
  }).replace(/<\//g, '<\\/');

  const probe = doc.createElement('script');
  probe.textContent =
    `var APS_CFG=${cfgJson};\n` +
    `var __apsRun=function(){try{var r=(${apsProbe.toString()})(APS_CFG);` +
    `parent.postMessage({__aps:'result',r:r},'*');}` +
    `catch(e){parent.postMessage({__aps:'result',err:String(e&&e.message||e)},'*');}};\n` +
    `setTimeout(__apsRun,1200);setTimeout(__apsRun,2600);setTimeout(__apsRun,4300);`;
  doc.body.appendChild(probe);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:none;visibility:hidden;pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    let last: ProbeResult | null = null;
    let count = 0;
    let lastSig = '';
    let stable = false;
    // position+visibility signature per element (uids are random per run,
    // so identity is compared by measured geometry instead)
    const sigOf = (r: ProbeResult) =>
      (r.elements ?? [])
        .map((e) => `${e.type}@${e.x},${e.y},${e.width},${e.height},${e.visible}`)
        .join('|');
    const onMsg = (e: MessageEvent) => {
      if (e.source === iframe.contentWindow && e.data?.__aps === 'result' && e.data.r) {
        const r = e.data.r as ProbeResult;
        const s = sigOf(r);
        // two consecutive identical snapshots = settled state
        if (last && s === lastSig) stable = true;
        lastSig = s;
        last = r;
        count++;
      }
    };
    window.addEventListener('message', onMsg);
    iframe.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    // take the latest snapshot: settle early once consecutive snapshots
    // agree; keep waiting for the 3rd when the DOM is still changing
    // (multi-screen creatives slide their main screen in around t≈3s)
    const deadline = performance.now() + 5200;
    while (performance.now() < deadline) {
      if (count >= 3 || (stable && count >= 2)) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    window.removeEventListener('message', onMsg);
    return last;
  } finally {
    iframe.remove();
  }
}

async function importHtml(html: string, src: Source): Promise<ImportResult> {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // strip scripts — layout is measured CSS-only in a sandboxed iframe
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('noscript').forEach((s) => s.remove());

  const meta = doc.querySelector('meta[name="ad.size"]')?.getAttribute('content') ?? '';
  const m = /width\s*=\s*(\d+)\s*,\s*height\s*=\s*(\d+)/i.exec(meta);
  const W = m ? parseInt(m[1]) : 0;
  const H = m ? parseInt(m[2]) : 0;

  const assets: AssetRef[] = [];
  const dataUrlToAsset = new Map<string, string>();
  const project = createProject(src.name || 'Imported creative', W || 300, H || 250);

  // resolve a relative ref to a data URL + register it as an asset.
  // Only actual image/font files become assets — a stylesheet or
  // script matched by a stray href/src must never be pushed as one.
  const resolveRef = async (ref: string): Promise<string | null> => {
    const clean = normPath(ref.split('?')[0].split('#')[0]);
    if (!clean || /^data:|^https?:|^blob:/i.test(clean)) return null;
    if (!IMG_EXT.test(clean) && !FONT_EXT.test(clean)) return null;
    const tryPaths = [clean, basename(clean)];
    const cands = src.candidates();
    for (const t of tryPaths) {
      const hit = cands.find((c) => c === t || c.endsWith('/' + t) || basename(c) === t);
      const bytes = hit ? await src.getBytes(hit) : null;
      if (bytes) {
        const mime = MIME[ext(hit!)] ?? 'application/octet-stream';
        const du = await bytesToDataUrl(bytes, mime);
        if (!dataUrlToAsset.has(du)) {
          const asset: AssetRef = {
            id: uid('as'), name: basename(hit!),
            kind: mime.startsWith('font/') ? 'font' : 'image',
            mimeType: mime, src: du,
          };
          assets.push(asset);
          dataUrlToAsset.set(du, asset.id);
        }
        return du;
      }
    }
    return null;
  };

  // rewrite element src/href attributes
  const refAttrs = doc.querySelectorAll('[src],[href]');
  for (const el of Array.from(refAttrs)) {
    for (const attr of ['src', 'href'] as const) {
      const v = el.getAttribute(attr);
      if (!v || /^data:|^https?:|^javascript:|^blob:|^#/i.test(v)) continue;
      const du = await resolveRef(v);
      if (du) el.setAttribute(attr, du);
    }
  }

  // rewrite url() inside <style> blocks and style attributes
  const rewriteUrls = async (css: string): Promise<string> => {
    const matches = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)];
    let out = css;
    for (const mm of matches) {
      const du = await resolveRef(mm[1]);
      if (du) out = out.split(mm[0]).join(`url("${du}")`);
    }
    return out;
  };
  for (const st of Array.from(doc.querySelectorAll('style'))) {
    st.textContent = await rewriteUrls(st.textContent ?? '');
  }
  for (const el of Array.from(doc.querySelectorAll('[style]'))) {
    el.setAttribute('style', await rewriteUrls(el.getAttribute('style') ?? ''));
  }

  // map a src string (data URL / http) emitted by the probe to an
  // asset id, registering it if unseen
  const srcToAssetId = (s: string | undefined): string | undefined => {
    if (!s) return undefined;
    if (dataUrlToAsset.has(s)) return dataUrlToAsset.get(s);
    const a: AssetRef = {
      id: uid('as'),
      name: basename(s.split('?')[0].split('#')[0]) || 'asset',
      kind: /^data:font\//.test(s) ? 'font' : 'image',
      mimeType: s.startsWith('data:') ? (s.slice(5, s.indexOf(';')) || 'image/png') : 'image/png',
      src: s,
    };
    assets.push(a);
    dataUrlToAsset.set(s, a.id);
    return a.id;
  };
  const mapProbeElement = (e: Record<string, unknown>): AdElement => {
    const { assetSrc, ...rest } = e as Record<string, unknown> & { assetSrc?: string };
    const el = rest as unknown as AdElement;
    if (assetSrc) (el as ImageElement).assetId = srcToAssetId(assetSrc);
    const cfg = (el as { config?: { slides?: { assetSrc?: string; assetId?: string }[] } }).config;
    if (cfg?.slides) {
      cfg.slides = cfg.slides.map((s) => {
        const { assetSrc: ss, ...sr } = s;
        return { ...sr, assetId: srcToAssetId(ss) };
      });
    }
    return el;
  };

  // primary measurement: run the creative's OWN scripts inside an
  // opaque-origin sandbox and measure the live DOM it builds. Captures
  // JS-created nodes and real class states that the CSS-only fallback
  // below can never see.
  const probeRes = await runProbe(html, src);
  if (probeRes && probeRes.elements.length) {
    if (probeRes.w >= 40 && probeRes.h >= 40) {
      project.artboard.width = probeRes.w;
      project.artboard.height = probeRes.h;
    }
    if (probeRes.bg) project.artboard.backgroundColor = probeRes.bg;
    project.elements = probeRes.elements.map(mapProbeElement);
    project.assets = assets;
    const ct = probeRes.clickTag ?? /var\s+clickTag\s*=\s*["']([^"']+)/.exec(html)?.[1];
    if (ct && /^https?:/i.test(ct)) project.clickTag = ct;
    const comps = project.elements.filter(
      (e) => e.type !== 'image' && e.type !== 'video' && e.type !== 'text' && e.type !== 'button' && e.type !== 'shape',
    ).length;
    return {
      ok: true, fidelity: 'flattened', project,
      message:
        `Imported ${project.elements.length} element(s) + ${assets.length} asset(s)` +
        (comps ? `, including ${comps} animated component(s) reconstructed` : '') +
        ` — measured live with the creative's own scripts.`,
    };
  }

  // render offscreen & measure. allow-same-origin is required to read
  // contentDocument; scripts remain disabled since tags were stripped
  // and allow-scripts is not granted.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:none;visibility:hidden;pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    // <base> kills any leftover relative refs (they'd otherwise resolve
    // against the editor's own origin and 404 or worse)
    const base = doc.createElement('base');
    base.setAttribute('href', 'about:blank');
    doc.head.prepend(base);
    // freeze animations/transitions so every node is measured at its
    // authored base state (deterministic frame-1, not a random offset)
    const freeze = doc.createElement('style');
    freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    doc.head.appendChild(freeze);
    // sentinel lets us distinguish the srcdoc document from the
    // initial about:blank doc (whose load event fires first and would
    // otherwise resolve our wait against an empty body)
    const sentinel = doc.createElement('meta');
    sentinel.setAttribute('name', 'aps-import');
    doc.head.appendChild(sentinel);
    iframe.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    const deadline = performance.now() + 4000;
    await new Promise<void>((resolve) => {
      const check = () => {
        const d = iframe.contentDocument;
        if (d?.querySelector('meta[name="aps-import"]') && d.readyState === 'complete') return resolve();
        if (performance.now() > deadline) return resolve();
        setTimeout(check, 50);
      };
      iframe.onload = check;
      check();
    });
    await new Promise((r) => setTimeout(r, 350)); // let images/fonts settle

    const idoc = iframe.contentDocument;
    if (!idoc) return { ok: false, fidelity: 'flattened', message: 'Could not render creative for measurement' };

    const container =
      (idoc.querySelector('.ad-container') as HTMLElement | null) ??
      (idoc.body.firstElementChild as HTMLElement | null) ??
      idoc.body;
    const crect = container.getBoundingClientRect();
    // the rendered container is more honest than ad.size — some
    // creatives ship stale meta (this file says 300x600, is 300x250)
    if (crect.width >= 40 && crect.height >= 40) {
      project.artboard.width = Math.round(crect.width);
      project.artboard.height = Math.round(crect.height);
    }

    const cs = idoc.defaultView!.getComputedStyle(container);
    const bgc = cs.backgroundColor;
    if (bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'transparent') {
      project.artboard.backgroundColor = bgc.startsWith('#') ? bgc : rgbToHex(bgc) ?? '#ffffff';
    }

    const elements: AdElement[] = [];
    const iwin = idoc.defaultView!;
    const ANIM = () => ({
      preset: 'none' as const, delay: 0, duration: 800,
      easing: 'ease-out' as const, iterations: 1, direction: 'normal' as const,
    });

    const normDeg = (d: number) => {
      let v = d % 360;
      if (v > 180) v -= 360;
      if (v < -180) v += 360;
      return Math.round(v);
    };

    const allStyleText = Array.from(doc.querySelectorAll('style'))
      .map((s) => s.textContent ?? '').join('\n');

    // JS-toggled "settled" states never fire with scripts stripped —
    // statically add modifier classes whose rules change geometry
    // (e.g. .screens-wrapper.show-screen2{transform:translateX(-300px)}),
    // so off-canvas screens land where the creative ends up showing them
    for (const mm of allStyleText.matchAll(/\.([a-zA-Z][\w-]*)\.([a-zA-Z][\w-]*)[^{}]*\{([^}]*)\}/g)) {
      const [, baseCls, mod, body] = mm;
      if (!/^(show|shown|active|is-active|is-on|on|open|in|visible|current)[\w-]*$/i.test(mod)) continue;
      if (!/(transform|translate|left|right|top|bottom|display|visibility|opacity)\s*:/i.test(body)) continue;
      idoc.querySelectorAll('.' + baseCls).forEach((n) => n.classList.add(mod));
    }
    void idoc.body.offsetHeight; // force reflow before measuring

    // multi-screen creatives: a horizontal track of container-sized panes
    // (e.g. .screens-wrapper > .screen*2). Coordinates normalize into the
    // owning pane's space; earlier panes import hidden, last pane is the
    // settled end state.
    const panes: Element[] = (() => {
      for (const w of Array.from(idoc.querySelectorAll('*'))) {
        const wr = w.getBoundingClientRect();
        if (wr.width < crect.width * 1.5 || wr.height < crect.height * 0.7) continue;
        const kids = Array.from(w.children).filter((k) => {
          const kr = k.getBoundingClientRect();
          return kr.width >= crect.width * 0.9 && kr.height >= crect.height * 0.7;
        });
        if (kids.length >= 2) return kids;
      }
      return [];
    })();
    const paneOf = (n: Element): Element | null =>
      panes.find((p) => p === n || p.contains(n)) ?? null;
    const lastPane = panes[panes.length - 1] ?? null;
    const frameLeft = (n: Element) => (paneOf(n) ?? container).getBoundingClientRect().left;
    const inEarlyPane = (n: Element) => {
      const p = paneOf(n);
      return p != null && p !== lastPane;
    };

    // register a (possibly remote/data) <img> src as an asset, reusing
    // whatever was already captured — shared by the plain IMG branch
    // and the carousel-slide detector below
    const registerImgAsset = (srcAttr: string): string | undefined => {
      if (!srcAttr) return undefined;
      let aid = srcAttr.startsWith('data:') ? dataUrlToAsset.get(srcAttr) : undefined;
      if (!aid && srcAttr.startsWith('data:')) {
        const a: AssetRef = {
          id: uid('as'), name: 'imported-image', kind: 'image',
          mimeType: srcAttr.slice(5, srcAttr.indexOf(';')) || 'image/png', src: srcAttr,
        };
        assets.push(a);
        dataUrlToAsset.set(srcAttr, a.id);
        aid = a.id;
      }
      if (!aid && /^https?:/i.test(srcAttr)) {
        const a: AssetRef = {
          id: uid('as'), name: basename(srcAttr.split('?')[0]) || 'remote-image',
          kind: 'image', mimeType: 'image/png', src: srcAttr,
        };
        assets.push(a);
        aid = a.id;
      }
      return aid;
    };

    // Recognize a JS-driven "staged slides" carousel — the same
    // center/left/right/hidden pattern used across the inspected
    // references (CarouselSlider, Spotlight, etc): 3+ sibling
    // containers, each holding one image, each roughly the same size
    // but authored at different staging offsets. When found, synthesize
    // a real CarouselElement (which has its own working autoplay
    // runtime) instead of flattening each slide to a static image.
    // a container can authored with height:100% of an auto-height
    // positioned ancestor, which CSS resolves to 0 — the box collapses
    // even though its image content still renders (unclipped overflow).
    // Fall back to the innermost non-collapsed descendant's rect.
    const visualRect = (el: HTMLElement): DOMRect => {
      const r = el.getBoundingClientRect();
      if (r.width >= 10 && r.height >= 10) return r;
      const img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (img) {
        const ir = (img as HTMLElement).getBoundingClientRect();
        if (ir.width >= 10 && ir.height >= 10) return ir;
      }
      let child = el.firstElementChild as HTMLElement | null;
      while (child) {
        const cr = child.getBoundingClientRect();
        if (cr.width >= 10 && cr.height >= 10) return cr;
        child = child.firstElementChild as HTMLElement | null;
      }
      return r;
    };

    const detectSlideGroup = (node: Element): CarouselElement | null => {
      // measure in the owning screen-pane's space (crect otherwise)
      const frame = paneOf(node)?.getBoundingClientRect() ?? crect;
      const kids = Array.from(node.children) as HTMLElement[];
      if (kids.length < 3) return null;

      const saved = kids.map((k) => k.getAttribute('style'));
      kids.forEach((k) => {
        k.style.setProperty('display', 'block', 'important');
        k.style.setProperty('visibility', 'visible', 'important');
        k.style.setProperty('opacity', '1', 'important');
      });
      const rects = kids.map((k) => visualRect(k));
      const filters = kids.map((k) => iwin.getComputedStyle(k).filter);
      kids.forEach((k, i) => {
        if (saved[i] !== null) k.setAttribute('style', saved[i]!);
        else k.removeAttribute('style');
      });

      const valid = rects.filter((r) => r.width >= 10 && r.height >= 10);
      if (valid.length < 3) return null;
      const avgW = valid.reduce((s, r) => s + r.width, 0) / valid.length;
      const avgH = valid.reduce((s, r) => s + r.height, 0) / valid.length;
      const uniform = valid.every((r) =>
        Math.abs(r.width - avgW) / avgW < 0.4 && Math.abs(r.height - avgH) / avgH < 0.4);
      if (!uniform) return null;

      const imgs = kids.map((k) => (k.tagName === 'IMG' ? k : k.querySelector('img')));
      if (imgs.filter(Boolean).length < Math.max(3, kids.length - 1)) return null;

      // rich-card slides carry product text + a CTA inside each slide —
      // extract it so the card layout survives reconstruction
      const squish = (s: string) => s.replace(/\s+/g, ' ').trim();
      const slideMeta = kids.map((k) => {
        const pick = (sel: string) => squish(k.querySelector(sel)?.textContent ?? '');
        const title = pick('h1,h2,h3,h4,h5,[class*="title" i],[class*="name" i]');
        let price = '', oldPrice = '';
        const priceEl = k.querySelector(
          '[class*="subtitle" i],[class*="price" i],[class*="amount" i],[class*="cost" i]',
        );
        if (priceEl) {
          oldPrice = squish(
            priceEl.querySelector('s,strike,del,[style*="line-through" i]')?.textContent ?? '',
          );
          const full = squish(priceEl.textContent ?? '');
          price = oldPrice ? full.replace(oldPrice, '').trim() : full;
        }
        const ctaEl = k.querySelector('button,[class*="shop" i],[class*="cta" i]');
        const ctaLabel = squish(ctaEl?.textContent ?? '');
        let url = '';
        const idx =
          ctaEl?.getAttribute('data-click-index') ??
          k.querySelector('[data-click-index]')?.getAttribute('data-click-index') ??
          '';
        if (idx) {
          url = new RegExp(`clickTag${idx}\\s*=\\s*['"]([^'"]+)`).exec(html)?.[1] ?? '';
        }
        if (!url) {
          url =
            ctaEl?.getAttribute('data-click-url') ??
            k.querySelector('[data-click-url]')?.getAttribute('data-click-url') ??
            '';
        }
        if (url && !/^https?:/i.test(url)) url = '';
        return { title, price, oldPrice, ctaLabel, url };
      });
      const cardish = slideMeta.filter((m) => m.title || m.price).length >= 2;
      let cardWPct: number | undefined;
      if (cardish) {
        const ki = slideMeta.findIndex((m) => m.title || m.price);
        const inner = kids[ki]?.querySelector('[class*="card" i],[class*="content" i]')
          ?? kids[ki]?.firstElementChild;
        if (inner && kids[ki]) {
          const kr = kids[ki].getBoundingClientRect();
          const ir = inner.getBoundingClientRect();
          if (ir.width > kr.width * 0.3 && ir.width < kr.width * 0.98) {
            cardWPct = Math.min(98, Math.max(20, Math.round((ir.width / kr.width) * 100)));
          }
        }
      }

      const slides: SlideConfig[] = kids.map((_, i) => ({
        id: uid('sl'),
        assetId: registerImgAsset(imgs[i]?.getAttribute('src') ?? ''),
        title: slideMeta[i].title.slice(0, 200), subtitle: '',
        ...(slideMeta[i].price ? { price: slideMeta[i].price.slice(0, 40) } : {}),
        ...(slideMeta[i].oldPrice ? { oldPrice: slideMeta[i].oldPrice.slice(0, 40) } : {}),
        ...(slideMeta[i].ctaLabel ? { ctaLabel: slideMeta[i].ctaLabel.slice(0, 80) } : {}),
        ...(slideMeta[i].url ? { url: slideMeta[i].url.slice(0, 2000) } : {}),
      }));
      if (slides.filter((s) => s.assetId).length < 2) return null;

      const common = kids.length
        ? [...new Set(Array.from(kids[0].classList))].filter((c) => kids.every((k) => k.classList.contains(c)))
        : [];
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // The un-stated items (no JS-assigned modifier) all sit at the same
      // authored "default" offset, which is usually an off-stage position
      // — not a usable bounding box. Instead, discover the modifier class
      // that represents the "shown/center" state (largest rendered area
      // among <base>.<modifier> selectors) and measure one slide in it.
      let box = { left: 0, top: 0, width: 0, height: 0 };
      const modifiers = new Set<string>();
      for (const c of common) {
        const re = new RegExp(`\\.${esc(c)}\\.([a-zA-Z0-9_-]+)`, 'g');
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(allStyleText))) modifiers.add(mm[1]);
      }
      let bestArea = 0;
      const probe = kids[0];
      const probeSaved = probe.getAttribute('class');
      for (const mod of modifiers) {
        probe.classList.add(mod);
        const pr = probe.getBoundingClientRect();
        const area = pr.width * pr.height;
        if (area > bestArea) {
          bestArea = area;
          box = { left: pr.left, top: pr.top, width: pr.width, height: pr.height };
        }
        probe.classList.remove(mod);
      }
      if (probeSaved !== null) probe.setAttribute('class', probeSaved);
      else probe.removeAttribute('class');

      // fall back to the uniform-size union only if it's plausibly
      // within the artboard; otherwise center a default-sized box
      if (bestArea === 0) {
        const left = Math.min(...valid.map((r) => r.left));
        const top = Math.min(...valid.map((r) => r.top));
        const right = Math.max(...valid.map((r) => r.left + r.width));
        const bottom = Math.max(...valid.map((r) => r.top + r.height));
        const plausible = left < frame.right && right > frame.left && top < frame.bottom && bottom > frame.top;
        box = plausible
          ? { left, top, width: right - left, height: bottom - top }
          : { left: frame.left + frame.width * 0.15, top: frame.top + frame.height * 0.3, width: frame.width * 0.7, height: frame.height * 0.45 };
      }

      // stage variant dims non-center slides via filter — search the
      // stylesheet for any <base>.<modifier> rule carrying a filter,
      // since the default (class-less) state never shows it
      const stageLike = common.some((c) =>
        new RegExp(`\\.${esc(c)}\\.[a-zA-Z0-9_-]+[^{]*\\{[^}]*filter\\s*:\\s*brightness`, 'i').test(allStyleText));
      const variant: 'coverflow' | 'stage' = stageLike || filters.some((f) => f && f !== 'none') ? 'stage' : 'coverflow';
      // autoplay period — the interval arg is often a named constant
      // (setInterval(fn, slideDuration)) rather than a literal
      const intervalMs = (() => {
        const m = /setInterval\([^,]+,\s*([A-Za-z_$][\w$]*|\d+)\s*\)/.exec(html);
        if (!m) return 2500;
        if (/^\d+$/.test(m[1])) return parseInt(m[1]);
        const v = new RegExp(`${m[1]}\\s*=\\s*(\\d+)`).exec(html);
        return v ? parseInt(v[1]) : 2500;
      })();
      let transitionMs = 600;
      for (const c of common) {
        const re = new RegExp(`\\.${esc(c)}[^{]*\\{[^}]*transition:[^;]*?(\\d*\\.?\\d+)s`, 'i');
        const m = re.exec(allStyleText);
        if (m) { transitionMs = Math.round(parseFloat(m[1]) * 1000); break; }
      }

      return {
        id: uid(), type: 'carousel', name: 'Carousel',
        x: Math.round(box.left - frame.left), y: Math.round(box.top - frame.top),
        width: Math.round(box.width), height: Math.round(box.height),
        rotation: 0, opacity: 1, visible: !inEarlyPane(node), locked: false,
        animation: ANIM(),
        config: {
          slides, autoplay: true, intervalMs, transitionMs,
          pauseOnHover: /clearInterval/.test(html) && /mouseenter|mouseover/.test(html),
          variant,
          ...(cardish ? { slideLayout: 'card' as const } : {}),
          ...(cardWPct != null ? { cardWPct } : {}),
        },
      };
    };

    // nodes consumed by a component reconstruction — skip in walk
    const consumed = new Set<Element>();
    const markConsumed = (node: Element) => {
      consumed.add(node);
      node.querySelectorAll('*').forEach((n) => consumed.add(n));
    };

    // JS-built slice-flip creatives (BaytAlHadeeqa Slice): the slices
    // exist only at runtime, so detection keys on the container markup
    // plus a script array of image paths — not on rendered DOM.
    // Detected ahead of the main walk, but must still land at its real
    // DOM position in `elements` or it always gets the lowest z-index
    // and ends up buried under whatever renders after it (e.g. a
    // background image sibling).
    let sliceFlipHost: Element | null = null;
    let sliceFlipPushed = false;
    let sliceFlipEl: SliceFlipElement | null = null;
    const detectSliceFlip = async (): Promise<SliceFlipElement | null> => {
      const sliceHost = idoc.querySelector(
        '[class*="slices_container"],[class*="slice-inner"],[id*="slice" i]',
      );
      if (!sliceHost || !/rotateY\s*\(/.test(html)) return null;

      // first array literal holding >=3 quoted image paths = slide list
      let paths: string[] = [];
      for (const m of html.matchAll(/=\s*\[((?:[^\]])*)\]/g)) {
        const ps = [...m[1].matchAll(/['"]([^'"]+\.(?:png|jpe?g|gif|webp|svg))['"]/gi)]
          .map((x) => x[1]);
        if (ps.length >= 3) { paths = ps; break; }
      }
      if (paths.length < 3) return null;

      const slides: SlideConfig[] = [];
      for (const p of paths.slice(0, 20)) {
        const du = await resolveRef(p);
        slides.push({
          id: uid('sl'),
          assetId: du ? dataUrlToAsset.get(du) : undefined,
          title: '', subtitle: '',
        });
      }
      if (slides.filter((s) => s.assetId).length < 2) return null;

      const host = (sliceHost.parentElement ?? sliceHost) as HTMLElement;
      const r = host.getBoundingClientRect();
      const cfgNum = (names: string[], d: number) => {
        for (const n of names) {
          const m = new RegExp(`${n}\\s*=\\s*(\\d+)`, 'i').exec(html);
          if (m) return parseInt(m[1]);
        }
        return d;
      };

      markConsumed(host);
      sliceFlipHost = host;
      return {
        id: uid(), type: 'slice-flip', name: 'Slice Flip',
        x: Math.round(r.left - frameLeft(host)), y: Math.round(r.top - crect.top),
        width: Math.max(10, Math.round(r.width)), height: Math.max(10, Math.round(r.height)),
        rotation: 0, opacity: 1, visible: !inEarlyPane(host), locked: false,
        animation: ANIM(),
        config: {
          slides,
          sliceCount: Math.min(20, Math.max(2, cfgNum(['SLICE_COUNT', 'sliceCount', 'NUM_SLICES'], 8))),
          flipMs: Math.min(10000, Math.max(100, cfgNum(['DURATION', 'flipMs', 'flipDuration'], 1200))),
          staggerMs: Math.min(2000, Math.max(0, cfgNum(['STAGGER', 'staggerMs'], 100))),
          holdMs: Math.min(60000, Math.max(200, cfgNum(['HOLD', 'holdMs', 'autoplayIntervalMs'], 3000))),
          autoplay: true,
        },
      };
    };

    const walk = (node: Element) => {
      if (elements.length > 150) return;
      if (node === sliceFlipHost) {
        if (sliceFlipEl && !sliceFlipPushed) { elements.push(sliceFlipEl); sliceFlipPushed = true; }
        return;
      }
      if (consumed.has(node)) return;
      if (node.classList.contains('clickLayer') || node.id === 'clickLayer') return;

      const style = iwin.getComputedStyle(node);
      const nodeStyle = (node as HTMLElement).style;
      // staged/hidden nodes (off-frame carousel slides, fade-in targets):
      // transiently reveal them so they still land on the artboard,
      // marked hidden so the Layers panel can toggle them.
      const initiallyHidden =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0;
      const savedStyle = node.getAttribute('style');
      if (initiallyHidden) {
        nodeStyle.setProperty('display', 'block', 'important');
        nodeStyle.setProperty('visibility', 'visible', 'important');
        nodeStyle.setProperty('opacity', '1', 'important');
      }

      try {
        const r = node.getBoundingClientRect();
        // a 0-size box just means "don't emit" — children may still
        // be measurable (absolutely-positioned subtrees collapse
        // their static parent's box to zero)
        // images can be legitimately slivers (e.g. a 2.5px-wide terms
        // strip); other tags keep the 4px floor to filter noise
        const minDim = node.tagName === 'IMG' ? 2 : 4;
        if (r.width >= minDim && r.height >= minDim) {
        // recover rotation: measure the un-transformed box, then
        // center it on the transformed bounding box
        const tm = /matrix\(([^)]+)\)/.exec(style.transform);
        let rotation = 0;
        const paneX = frameLeft(node);
        let x = Math.round(r.left - paneX);
        let y = Math.round(r.top - crect.top);
        let w = Math.round(r.width);
        let h = Math.round(r.height);
        if (tm) {
          const [a, b, c, d] = tm[1].split(',').map(Number);
          const angle = normDeg(Math.atan2(b, a) * 180 / Math.PI);
          if (Math.abs(angle) > 1) {
            const prevT = nodeStyle.getPropertyValue('transform');
            const prevTP = nodeStyle.getPropertyPriority('transform');
            nodeStyle.setProperty('transform', 'none', 'important');
            const r2 = node.getBoundingClientRect();
            nodeStyle.setProperty('transform', prevT, prevTP);
            w = Math.round(r2.width * (Math.hypot(a, b) || 1));
            h = Math.round(r2.height * (Math.hypot(c, d) || 1));
            rotation = angle;
            x = Math.round(r.left + r.width / 2 - paneX - w / 2);
            y = Math.round(r.top + r.height / 2 - crect.top - h / 2);
          }
        }

        const offCanvas =
          x + w <= 0 || y + h <= 0 || x >= crect.width || y >= crect.height;
        const base = {
          x, y, width: w, height: h, rotation,
          opacity: initiallyHidden ? 1 : Math.min(1, Math.max(0, parseFloat(style.opacity) || 1)),
          visible: !initiallyHidden && !offCanvas && !inEarlyPane(node),
          locked: false,
          animation: ANIM(),
        };

        const tag = node.tagName;

        if (tag === 'VIDEO') {
          // remote URLs only — local video files aren't inlined into the
          // asset map (multi-MB data URLs would exceed project storage)
          const vsrc =
            node.getAttribute('src') ??
            node.querySelector('source')?.getAttribute('src') ??
            '';
          elements.push({
            id: uid(), type: 'video', name: 'Video',
            ...base,
            src: /^https?:|^data:/i.test(vsrc) ? vsrc : '',
            fit: style.objectFit === 'contain' || style.objectFit === 'fill' ? style.objectFit : 'cover',
            autoplay: true, loop: true, muted: true,
          } as VideoElement);
          return;
        }

        if (tag === 'IMG') {
          const srcAttr = node.getAttribute('src') ?? '';
          const aid = registerImgAsset(srcAttr);
          if (aid) {
            const el: ImageElement = {
              id: uid(), type: 'image', name: node.getAttribute('alt') || 'Image',
              ...base,
              assetId: aid,
              fit: style.objectFit === 'cover' || style.objectFit === 'contain' ? style.objectFit : 'fill',
              borderRadius: parseFloat(style.borderRadius) || 0,
            };
            elements.push(el);
            return;
          }
        }

        // background-image / gradient elements → image element or shape fill
        const bg = style.backgroundImage;
        const bgUrl = /url\(["']?(.*?)["']?\)/.exec(bg)?.[1] ?? '';
        if (bgUrl) {
          let aid = dataUrlToAsset.get(bgUrl);
          if (!aid && bgUrl.startsWith('data:')) {
            const a: AssetRef = {
              id: uid('as'), name: 'bg-image', kind: 'image',
              mimeType: bgUrl.slice(5, bgUrl.indexOf(';')) || 'image/png', src: bgUrl,
            };
            assets.push(a); dataUrlToAsset.set(bgUrl, a.id); aid = a.id;
          }
          if (aid) {
            const el: ImageElement = {
              id: uid(), type: 'image', name: 'Background image',
              ...base,
              assetId: aid,
              fit: style.backgroundSize === 'contain' ? 'contain' : 'cover',
              borderRadius: parseFloat(style.borderRadius) || 0,
            };
            elements.push(el);
            // still recurse — the div may contain text/cta children
            for (const child of Array.from(node.children)) walk(child);
            return;
          }
        }
        // gradient with no resolvable url → remember first stop as fill
        const gradientStop = /gradient\(/.test(bg)
          ? /#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(bg)?.[0] ?? ''
          : '';
        const gradientFill = gradientStop ? rgbToHex(gradientStop) ?? null : null;
        const gradientAlpha = gradientStop ? alphaOf(gradientStop) : 1;

        // leaf nodes with their own text → text element (or button)
        const ownText = [...node.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? '')
          .join(' ').trim();
        if (ownText) {
          const isBtn = tag === 'BUTTON' || tag === 'A' || style.cursor === 'pointer';
          const fontWeight = Math.min(900, Math.max(100,
            Math.round((parseFloat(style.fontWeight) || 400) / 100) * 100));
          if (isBtn) {
            const href = tag === 'A' ? node.getAttribute('href') ?? '' : '';
            const el: ButtonElement = {
              id: uid(), type: 'button', name: ownText.slice(0, 24) || 'CTA',
              ...base,
              label: ownText,
              fontFamily: style.fontFamily || 'Arial, sans-serif',
              fontSize: Math.round(parseFloat(style.fontSize) || 12),
              fontWeight,
              color: rgbToHex(style.color) ?? '#ffffff',
              background: rgbToHex(style.backgroundColor) ?? '#111111',
              borderRadius: parseFloat(style.borderRadius) || 0,
              url: /^https?:/i.test(href) ? href : '',
              direction: (node.getAttribute('dir') === 'rtl' || style.direction === 'rtl') ? 'rtl' : 'ltr',
            };
            elements.push(el);
            return;
          }
          const el: TextElement = {
            id: uid(), type: 'text',
            name: ownText.slice(0, 24) || 'Text',
            ...base,
            content: ownText,
            fontFamily: style.fontFamily || 'Arial, sans-serif',
            fontSize: Math.round(parseFloat(style.fontSize) || 12),
            fontWeight,
            lineHeight: style.lineHeight === 'normal' ? 1.2 : Math.round((parseFloat(style.lineHeight) || 14) / (parseFloat(style.fontSize) || 12) * 100) / 100,
            letterSpacing: style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0,
            color: rgbToHex(style.color) ?? style.color,
            textAlign: (style.textAlign === 'center' || style.textAlign === 'right') ? style.textAlign : 'left',
            direction: style.direction === 'rtl' ? 'rtl' : 'ltr',
            background: 'transparent',
          };
          elements.push(el);
          return;
        }

        // filled / bordered nodes → shape (gradient counts as a fill)
        const bgCol = style.backgroundColor;

        // icon-only controls authored via ::before content (slider arrows
        // etc.) — preserve the glyph so they don't import as blank circles
        const clsAttr = `${node.getAttribute('class') ?? ''} ${node.getAttribute('aria-label') ?? ''}`;
        if (tag === 'BUTTON' || /prev|next|arrow|nav|btn/i.test(clsAttr)) {
          let pseudo = '';
          try { pseudo = iwin.getComputedStyle(node, '::before').content ?? ''; } catch { /* ok */ }
          const glyph = /^["']([\s\S]+)["']$/.exec(pseudo)?.[1] ?? '';
          if (glyph) {
            elements.push({
              id: uid(), type: 'button',
              name: node.getAttribute('aria-label') || 'Nav',
              ...base,
              label: glyph,
              fontFamily: style.fontFamily || 'Arial, sans-serif',
              fontSize: Math.max(8, Math.round(h * 0.45)),
              fontWeight: 400,
              color: rgbToHex(style.color) ?? '#333333',
              background:
                bgCol && bgCol !== 'rgba(0, 0, 0, 0)' && bgCol !== 'transparent'
                  ? bgCol : 'rgba(255,255,255,0.7)',
              borderRadius: parseFloat(style.borderRadius) || 0,
              url: '', direction: 'ltr',
            } as ButtonElement);
            return;
          }
        }

        const hasBg =
          (bgCol && bgCol !== 'rgba(0, 0, 0, 0)' && bgCol !== 'transparent') || gradientFill;
        const hasBorder = parseFloat(style.borderWidth) > 0 && style.borderStyle !== 'none';
        const fill =
          rgbToHex(bgCol) ?? gradientFill ??
          (hasBorder ? 'transparent' : '');
        // a translucent gradient/bg flattens to a solid shape — carry the
        // stop's alpha into element opacity so it doesn't occlude whatever
        // the source visually layers underneath it (e.g. a spotlight beam)
        const fillAlpha = fill === gradientFill && gradientFill
          ? gradientAlpha
          : (bgCol ? alphaOf(bgCol) : 1);
        if ((hasBg || hasBorder) && node !== container) {
          const el: ShapeElement = {
            id: uid(), type: 'shape', name: node.children.length ? 'Panel' : 'Shape',
            ...base,
            opacity: Math.round(base.opacity * fillAlpha * 1000) / 1000,
            shape: parseFloat(style.borderRadius) > Math.min(w, h) / 2.5 ? 'ellipse' : 'rect',
            fill: fill || 'transparent',
            borderColor: rgbToHex(style.borderColor) ?? 'transparent',
            borderWidth: hasBorder ? Math.round(parseFloat(style.borderWidth)) : 0,
            borderRadius: parseFloat(style.borderRadius) || 0,
          };
          // skip near-full-bleed wrapper panels — usually the ad body itself
          if (w * h < crect.width * crect.height * 0.98 || !node.children.length) {
            elements.push(el);
          }
        }
        }

        const slideGroup = detectSlideGroup(node);
        if (slideGroup) {
          elements.push(slideGroup);
        } else {
          for (const child of Array.from(node.children)) walk(child);
        }
      } finally {
        // restore authored styles before measuring siblings
        if (initiallyHidden) {
          if (savedStyle !== null) node.setAttribute('style', savedStyle);
          else node.removeAttribute('style');
        }
      }
    };

    sliceFlipEl = await detectSliceFlip();
    for (const child of Array.from(container.children)) walk(child);
    if (sliceFlipEl && !sliceFlipPushed) elements.push(sliceFlipEl);

    project.assets = assets;
    project.elements = elements;
    // imported creatives keep their own clickTag if declared
    const ct = /var\s+clickTag\s*=\s*["']([^"']+)/.exec(html)?.[1];
    if (ct && /^https?:/i.test(ct)) project.clickTag = ct;

    const check = validateProject(JSON.parse(JSON.stringify(project)));
    if (!check.ok) {
      return { ok: false, fidelity: 'flattened', message: `Import produced invalid data: ${check.errors[0]}` };
    }
    const reconstructed = elements.filter((e) => e.type === 'carousel' || e.type === 'slice-flip').length;
    return {
      ok: true, fidelity: 'flattened', project: check.project,
      message: elements.length
        ? `Imported ${elements.length} element(s) + ${assets.length} asset(s)` +
          (reconstructed
            ? `, including ${reconstructed} animated component(s) reconstructed from the creative. ` +
              `Other JS-driven motion isn't reconstructed — re-add animations in the timeline.`
            : `. Off-stage/staged frames arrive as hidden layers — JS-driven motion isn't reconstructed, re-add animations in the timeline.`)
        : `Rendered but measured 0 elements — the creative likely builds its DOM in JavaScript, which is stripped on import. ${assets.length} asset(s) were added to the library.`,
    };
  } finally {
    iframe.remove();
  }
}

function rgbToHex(c: string): string | null {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return /^#[0-9a-f]{3,8}$/i.test(c) ? c : null;
  const [r, g, b, a] = m[1].split(',').map((v) => parseFloat(v));
  if (a !== undefined && a === 0) return null;
  const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** alpha channel of an rgba()/#rrggbbaa color string, default 1 — used so a
 *  translucent gradient/background doesn't get flattened into an opaque
 *  shape that occludes whatever sits visually behind it in the source. */
function alphaOf(c: string): number {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const parts = m[1].split(',');
    return parts.length > 3 ? Math.max(0, Math.min(1, parseFloat(parts[3]))) : 1;
  }
  const hx = /^#[0-9a-f]{8}$/i.exec(c);
  return hx ? parseInt(c.slice(7, 9), 16) / 255 : 1;
}
