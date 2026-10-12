import JSZip from 'jszip';
import { validateProject } from '../model/schema';
import { createProject, uid } from '../model/defaults';
import type {
  AdElement,
  AssetRef,
  ButtonElement,
  CreativeProject,
  ImageElement,
  ShapeElement,
  TextElement,
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
  const files = new Map<string, File>();
  let htmlFile: File | null = null;
  let htmlScore = Infinity;
  for (const f of Array.from(list)) {
    const rel = normPath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
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

  // resolve a relative ref to a data URL + register it as an asset
  const resolveRef = async (ref: string): Promise<string | null> => {
    const clean = normPath(ref.split('?')[0].split('#')[0]);
    if (!clean || /^data:|^https?:|^blob:/i.test(clean)) return null;
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
    iframe.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    await new Promise((r) => { iframe.onload = r; setTimeout(r, 1500); });
    await new Promise((r) => setTimeout(r, 350)); // let images/fonts settle

    const idoc = iframe.contentDocument;
    if (!idoc) return { ok: false, fidelity: 'flattened', message: 'Could not render creative for measurement' };

    const container =
      (idoc.querySelector('.ad-container') as HTMLElement | null) ??
      (idoc.body.firstElementChild as HTMLElement | null) ??
      idoc.body;
    const crect = container.getBoundingClientRect();
    if (!m && crect.width > 10 && crect.height > 10) {
      project.artboard.width = Math.round(crect.width);
      project.artboard.height = Math.round(crect.height);
    }

    const cs = idoc.defaultView!.getComputedStyle(container);
    const bgc = cs.backgroundColor;
    if (bgc && bgc !== 'rgba(0, 0, 0, 0)' && bgc !== 'transparent') {
      project.artboard.backgroundColor = bgc.startsWith('#') ? bgc : rgbToHex(bgc) ?? '#ffffff';
    }

    const elements: AdElement[] = [];

    const push = (el: AdElement) => { elements.push(el); };

    const walk = (node: Element) => {
      const style = idoc.defaultView!.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (parseFloat(style.opacity) === 0) return;
      if (node.classList.contains('clickLayer') || node.id === 'clickLayer') return;

      const r = node.getBoundingClientRect();
      const x = Math.round(r.left - crect.left);
      const y = Math.round(r.top - crect.top);
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w < 4 || h < 4) return;

      const tag = node.tagName;

      if (tag === 'IMG') {
        const srcAttr = node.getAttribute('src') ?? '';
        const assetId = srcAttr.startsWith('data:') ? dataUrlToAsset.get(srcAttr) : undefined;
        // register remote/data images as assets too
        let aid = assetId;
        if (!aid && srcAttr.startsWith('data:')) {
          const a: AssetRef = { id: uid('as'), name: basename(srcAttr.slice(5, 40)) || 'image', kind: 'image', mimeType: srcAttr.slice(5, srcAttr.indexOf(';')) || 'image/png', src: srcAttr };
          assets.push(a);
          dataUrlToAsset.set(srcAttr, a.id);
          aid = a.id;
        }
        if (aid || srcAttr) {
          const el: ImageElement = {
            id: uid(), type: 'image', name: node.getAttribute('alt') || 'Image',
            x, y, width: w, height: h, rotation: 0, opacity: 1,
            visible: true, locked: false,
            animation: { preset: 'none', delay: 0, duration: 800, easing: 'ease-out', iterations: 1, direction: 'normal' },
            assetId: aid,
            fit: style.objectFit === 'cover' || style.objectFit === 'contain' || style.objectFit === 'fill' ? style.objectFit : 'contain',
            borderRadius: parseFloat(style.borderRadius) || 0,
          };
          if (srcAttr && !aid && /^https?:/i.test(srcAttr)) {
            const a: AssetRef = { id: uid('as'), name: basename(srcAttr.split('?')[0]) || 'remote-image', kind: 'image', mimeType: 'image/png', src: srcAttr };
            assets.push(a);
            el.assetId = a.id;
          }
          if (el.assetId) { push(el); return; }
        }
      }

      // background-image elements → image element
      const bg = style.backgroundImage;
      if (bg && bg !== 'none' && /url\(/.test(bg)) {
        const u = /url\(["']?(.*?)["']?\)/.exec(bg)?.[1] ?? '';
        let aid = dataUrlToAsset.get(u);
        if (!aid && u.startsWith('data:')) {
          const a: AssetRef = { id: uid('as'), name: 'bg-image', kind: 'image', mimeType: u.slice(5, u.indexOf(';')) || 'image/png', src: u };
          assets.push(a); dataUrlToAsset.set(u, a.id); aid = a.id;
        }
        if (aid) {
          const el: ImageElement = {
            id: uid(), type: 'image', name: 'Background image',
            x, y, width: w, height: h, rotation: 0, opacity: 1,
            visible: true, locked: false,
            animation: { preset: 'none', delay: 0, duration: 800, easing: 'ease-out', iterations: 1, direction: 'normal' },
            assetId: aid,
            fit: style.backgroundSize === 'cover' ? 'cover' : style.backgroundSize === 'contain' ? 'contain' : 'cover',
            borderRadius: parseFloat(style.borderRadius) || 0,
          };
          push(el); return;
        }
      }

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
          push({
            id: uid(), type: 'button', name: ownText.slice(0, 24) || 'CTA',
            x, y, width: w, height: h, rotation: 0, opacity: 1,
            visible: true, locked: false,
            animation: { preset: 'none', delay: 0, duration: 800, easing: 'ease-out', iterations: 1, direction: 'normal' },
            label: ownText,
            fontFamily: style.fontFamily || 'Arial, sans-serif',
            fontSize: Math.round(parseFloat(style.fontSize) || 12),
            fontWeight,
            color: rgbToHex(style.color) ?? '#ffffff',
            background: rgbToHex(style.backgroundColor) ?? '#111111',
            borderRadius: parseFloat(style.borderRadius) || 0,
            url: /^https?:/i.test(href) ? href : '',
          } as ButtonElement);
          return;
        }
        const el: TextElement = {
          id: uid(), type: 'text',
          name: ownText.slice(0, 24) || 'Text',
          x, y, width: w, height: h, rotation: 0, opacity: 1,
          visible: true, locked: false,
          animation: { preset: 'none', delay: 0, duration: 800, easing: 'ease-out', iterations: 1, direction: 'normal' },
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
        push(el);
        return;
      }

      // visible filled containers → shape
      const bgCol = style.backgroundColor;
      const hasBg = bgCol && bgCol !== 'rgba(0, 0, 0, 0)' && bgCol !== 'transparent';
      const hasBorder = parseFloat(style.borderWidth) > 0 && style.borderStyle !== 'none';
      const hasChildren = node.children.length > 0;
      if ((hasBg || hasBorder) && !hasChildren && node !== container) {
        const el: ShapeElement = {
          id: uid(), type: 'shape', name: 'Shape',
          x, y, width: w, height: h, rotation: 0, opacity: 1,
          visible: true, locked: false,
          animation: { preset: 'none', delay: 0, duration: 800, easing: 'ease-out', iterations: 1, direction: 'normal' },
          shape: parseFloat(style.borderRadius) > Math.min(w, h) / 2.5 ? 'ellipse' : 'rect',
          fill: rgbToHex(bgc) ?? bgc ?? 'transparent',
          borderColor: rgbToHex(style.borderColor) ?? 'transparent',
          borderWidth: hasBorder ? Math.round(parseFloat(style.borderWidth)) : 0,
          borderRadius: parseFloat(style.borderRadius) || 0,
        };
        push(el); return;
      }

      // containers also get a shape if they carry an obvious fill
      if (hasBg && node !== container && node.children.length > 0 && w * h < crect.width * crect.height * 0.95) {
        const el: ShapeElement = {
          id: uid(), type: 'shape', name: 'Panel',
          x, y, width: w, height: h, rotation: 0, opacity: 1,
          visible: true, locked: false,
          animation: { preset: 'none', delay: 0, duration: 800, easing: 'ease-out', iterations: 1, direction: 'normal' },
          shape: 'rect',
          fill: rgbToHex(bgc) ?? bgc ?? 'transparent',
          borderColor: 'transparent', borderWidth: 0,
          borderRadius: parseFloat(style.borderRadius) || 0,
        };
        push(el);
      }

      for (const child of Array.from(node.children)) walk(child);
    };

    for (const child of Array.from(container.children)) walk(child);

    project.assets = assets;
    project.elements = elements;
    // imported creatives keep their own clickTag if declared
    const ct = /var\s+clickTag\s*=\s*["']([^"']+)/.exec(html)?.[1];
    if (ct && /^https?:/i.test(ct)) project.clickTag = ct;

    const check = validateProject(JSON.parse(JSON.stringify(project)));
    if (!check.ok) {
      return { ok: false, fidelity: 'flattened', message: `Import produced invalid data: ${check.errors[0]}` };
    }
    return {
      ok: true, fidelity: 'flattened', project: check.project,
      message:
        `Imported as ${elements.length} flattened element(s) + ${assets.length} asset(s). ` +
        `Component animations collapse to their first frame — re-add carousels/cubes manually.`,
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
