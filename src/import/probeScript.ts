/* ------------------------------------------------------------------ *
 *  apsProbe — measurement script injected into the import iframe.
 *
 *  This function is serialized with Function.prototype.toString() and
 *  runs INSIDE the sandboxed measurement document, alongside the
 *  creative's own scripts. It must therefore be fully self-contained:
 *  no imports, no module-scope references, only plain JS + DOM APIs.
 *  Type annotations are fine (stripped before toString()).
 *
 *  It walks the live DOM — after the creative's own JS has built
 *  slides, applied classes and laid out the animation states — and
 *  postMessages serialized elements back to the editor.
 * ------------------------------------------------------------------ */

export interface ProbeCfg {
  /** raw creative source html (for script sniffing: setInterval, clickTag) */
  html: string;
  /** concatenated text of all <style> blocks + linked css files */
  styleText: string;
  /** normalized candidate path -> data URL (all local files, inlined) */
  pathMap: Record<string, string>;
}

export interface ProbeResult {
  w: number;
  h: number;
  bg?: string;
  elements: Record<string, unknown>[];
  /** unique asset src strings referenced by the emitted elements */
  assetSrcs: string[];
  clickTag?: string;
  /** detector diagnostics — why a candidate slide group was rejected */
  diag?: Record<string, unknown>;
}

export function apsProbe(cfg: ProbeCfg): ProbeResult {
  const D = document;
  const W = window;

  const uid = (p = 'el') =>
    `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

  const normPath = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');
  const basename = (p: string) => normPath(p).split('/').pop() ?? p;

  function rgbToHex(c: string): string | null {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return /^#[0-9a-f]{3,8}$/i.test(c) ? c : null;
    const [r, g, b, a] = m[1].split(',').map((v) => parseFloat(v));
    if (a === 0) return null;
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

  const normDeg = (d: number) => {
    let v = d % 360;
    if (v > 180) v -= 360;
    if (v < -180) v += 360;
    return Math.round(v);
  };

  const ANIM = () => ({
    preset: 'none', delay: 0, duration: 800,
    easing: 'ease-out', iterations: 1, direction: 'normal',
  });

  const elements: Record<string, unknown>[] = [];
  const assetSrcs: string[] = [];
  const seenSrc = new Set<string>();
  const diag: Record<string, unknown> = {};

  /** Resolve an img/bg src or a script-declared path to a usable src
   *  (data URL via pathMap for local files; http(s) passes through). */
  const registerSrc = (ref: string): string | undefined => {
    if (!ref) return undefined;
    if (/^data:|^https?:/i.test(ref)) {
      if (!seenSrc.has(ref)) { seenSrc.add(ref); assetSrcs.push(ref); }
      return ref;
    }
    const clean = normPath(ref.split('?')[0].split('#')[0]);
    if (!clean) return undefined;
    let hit = cfg.pathMap[clean] ?? cfg.pathMap[basename(clean)];
    if (!hit) {
      const k = Object.keys(cfg.pathMap).find(
        (c) => c === clean || c.endsWith('/' + clean) || basename(c) === clean,
      );
      if (k) hit = cfg.pathMap[k];
    }
    if (hit) {
      if (!seenSrc.has(hit)) { seenSrc.add(hit); assetSrcs.push(hit); }
      return hit;
    }
    return undefined;
  };

  const container =
    (D.querySelector('.ad-container') as HTMLElement | null) ??
    (D.body.firstElementChild as HTMLElement | null) ??
    D.body;
  const crect = container.getBoundingClientRect();
  const cs = W.getComputedStyle(container);
  const bgRaw = cs.backgroundColor;
  const bg =
    bgRaw && bgRaw !== 'rgba(0, 0, 0, 0)' && bgRaw !== 'transparent'
      ? (rgbToHex(bgRaw) ?? bgRaw)
      : undefined;

  /* multi-screen creatives: a horizontal track of container-sized panes
     slid across by JS (e.g. .screens-wrapper{translateX(-300px)}).
     Elements inside later panes measure off-canvas, so coordinates are
     normalized into the owning pane's space. The LAST pane is the
     settled end state — earlier panes import as hidden layers. */
  const panes: Element[] = (() => {
    for (const w of Array.from(container.querySelectorAll('*'))) {
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
  /** container-space origin for a node: its screen pane when inside one */
  const frameLeft = (n: Element) => (paneOf(n) ?? container).getBoundingClientRect().left;
  const inEarlyPane = (n: Element) => {
    const p = paneOf(n);
    return p != null && p !== lastPane;
  };

  /* a container can be authored height:100% of an auto-height
     positioned ancestor — CSS resolves it to 0 and the box collapses
     even though its image content still renders. Fall back to the
     innermost non-collapsed descendant's rect. */
  const visualRect = (el: HTMLElement): DOMRect => {
    const r = el.getBoundingClientRect();
    if (r.width >= 10 && r.height >= 10) return r;
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (img) {
      const ir = img.getBoundingClientRect();
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

  // staged-slides carousel: 3+ uniform siblings, each holding one image.
  // On live DOM the JS-assigned state classes are present, so the
  // currently-"center" slide is measured directly.
  const detectSlideGroup = (node: Element): Record<string, unknown> | null => {
    // measure in the owning screen-pane's space (crect otherwise)
    const frame = paneOf(node)?.getBoundingClientRect() ?? crect;
    const kids = Array.from(node.children) as HTMLElement[];
    if (kids.length < 3) return null;

    const saved = kids.map((k) => k.getAttribute('style'));
    kids.forEach((k) => {
      k.style.setProperty('display', 'block', 'important');
      k.style.setProperty('visibility', 'visible', 'important');
      k.style.setProperty('opacity', '1', 'important');
      // inline !important transform:none overrides class-driven state
      // transforms — this measures each kid's natural slide size
      k.style.setProperty('transform', 'none', 'important');
    });
    const natural = kids.map((k) => visualRect(k));
    kids.forEach((k, i) => {
      if (saved[i] !== null) k.setAttribute('style', saved[i]!);
      else k.removeAttribute('style');
    });
    // live rects (class transforms applied) — used for the box below
    const rects = kids.map((k) => visualRect(k));
    const filters = kids.map((k) => W.getComputedStyle(k).filter);
    const opas = kids.map((k) => parseFloat(W.getComputedStyle(k).opacity) || 0);

    // "same kind of slide" = same natural (un-transformed) size;
    // state-dependent scale differences must not count
    const valid = natural.filter((r) => r.width >= 10 && r.height >= 10);
    if (valid.length < 3) {
      diag.lastBail = `valid<3 kids=${kids.length} cls=${String(node.getAttribute('class')).slice(0, 40)} rects=${natural.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`).join(',')}`;
      return null;
    }
    const avgW = valid.reduce((s, r) => s + r.width, 0) / valid.length;
    const avgH = valid.reduce((s, r) => s + r.height, 0) / valid.length;
    const uniform = valid.every((r) =>
      Math.abs(r.width - avgW) / avgW < 0.4 && Math.abs(r.height - avgH) / avgH < 0.4);
    if (!uniform) {
      diag.lastBail = `nonuniform kids=${kids.length} cls=${String(node.getAttribute('class')).slice(0, 40)} natural=${natural.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`).join(',')}`;
      return null;
    }

    const imgs = kids.map((k) => (k.tagName === 'IMG' ? k : k.querySelector('img')));
    if (imgs.filter(Boolean).length < Math.max(3, kids.length - 1)) {
      diag.lastBail = `imgs<${Math.max(3, kids.length - 1)} kids=${kids.length} got=${imgs.filter(Boolean).length}`;
      return null;
    }

    // source image sizing behaviour (contain vs cover) — cover crops
    // vertically and makes imported cards look squashed
    const firstImg = imgs.find(Boolean);
    const slideFit = firstImg
      ? (W.getComputedStyle(firstImg as Element).objectFit || undefined)
      : undefined;

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
        url = new RegExp(`clickTag${idx}\\s*=\\s*['"]([^'"]+)`).exec(cfg.html)?.[1] ?? '';
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
    // card width vs slide width (e.g. a 90%-wide card centered in a
    // full-bleed slide) — measured from the largest card-like child
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

    const slides = kids.map((_, i) => ({
      id: uid('sl'),
      assetSrc: registerSrc(imgs[i]?.getAttribute('src') ?? ''),
      title: slideMeta[i].title.slice(0, 200), subtitle: '',
      ...(slideMeta[i].price ? { price: slideMeta[i].price.slice(0, 40) } : {}),
      ...(slideMeta[i].oldPrice ? { oldPrice: slideMeta[i].oldPrice.slice(0, 40) } : {}),
      ...(slideMeta[i].ctaLabel ? { ctaLabel: slideMeta[i].ctaLabel.slice(0, 80) } : {}),
      ...(slideMeta[i].url ? { url: slideMeta[i].url.slice(0, 2000) } : {}),
    }));
    if (slides.filter((s) => s.assetSrc).length < 2) {
      diag.lastBail = `slideSrcs<2 kids=${kids.length}`;
      return null;
    }

    const common = kids.length
      ? [...new Set(Array.from(kids[0].classList))].filter((c) => kids.every((k) => k.classList.contains(c)))
      : [];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // stage box: union of *visible* slide rects overlapping the container,
    // symmetrised around the centre slide so the component's 50%/50%
    // anchoring reproduces the source layout exactly.
    let box = { left: 0, top: 0, width: 0, height: 0 };
    let bestArea = 0;
    let ci = -1;
    rects.forEach((r, i) => {
      if (r.width >= 4 && r.height >= 4 && opas[i] > 0.05 &&
        r.left < frame.right && r.right > frame.left &&
        r.top < frame.bottom && r.bottom > frame.top) {
        const a = Math.min(r.right, frame.right) - Math.max(r.left, frame.left);
        const b = Math.min(r.bottom, frame.bottom) - Math.max(r.top, frame.top);
        if (a * b > bestArea) { bestArea = a * b; ci = i; }
      }
    });
    const geom: Record<string, number> = {};
    if (ci >= 0) {
      const vis = rects.filter((r, i) => r.width >= 4 && r.height >= 4 && opas[i] > 0.05);
      const cc = rects[ci];
      const cx = (cc.left + cc.right) / 2;
      const cy = (cc.top + cc.bottom) / 2;
      const L = Math.max(frame.left, Math.min(...vis.map((r) => r.left)));
      const T = Math.max(frame.top, Math.min(...vis.map((r) => r.top)));
      const R = Math.min(frame.right, Math.max(...vis.map((r) => r.right)));
      const B = Math.min(frame.bottom, Math.max(...vis.map((r) => r.bottom)));
      const hw = Math.max(cx - L, R - cx, natural[ci].width / 2);
      const hh = Math.max(cy - T, B - cy, natural[ci].height / 2);
      box = { left: cx - hw, top: cy - hh, width: hw * 2, height: hh * 2 };
      bestArea = box.width * box.height;
      // measured slide geometry: card size as % of box, side offset as
      // % of the card's natural width, side scale factor — lets the
      // carousel runtime reproduce the source layout exactly
      const nw = natural[ci].width, nh = natural[ci].height;
      geom.slideWPct = Math.round((nw / box.width) * 1000) / 10;
      geom.slideHPct = Math.round((nh / box.height) * 1000) / 10;
      const sides = vis.filter(
        (r) => r !== cc && Math.abs((r.left + r.right) / 2 - cx) > nw * 0.3,
      );
      if (sides.length) {
        const dx = sides.reduce((s, r) => s + Math.abs((r.left + r.right) / 2 - cx), 0) / sides.length;
        const sc = sides.reduce((s, r) => s + r.width, 0) / sides.length / nw;
        geom.sideXPct = Math.round((dx / nw) * 1000) / 10;
        geom.sideScale = Math.round(sc * 100) / 100;
      }
    }
    if (bestArea === 0) {
      const modifiers = new Set<string>();
      for (const c of common) {
        const re = new RegExp(`\\.${esc(c)}\\.([a-zA-Z0-9_-]+)`, 'g');
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(cfg.styleText))) modifiers.add(mm[1]);
      }
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
    }
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

    const stageLike = common.some((c) =>
      new RegExp(`\\.${esc(c)}\\.[a-zA-Z0-9_-]+[^{]*\\{[^}]*filter\\s*:\\s*brightness`, 'i').test(cfg.styleText));
    const variant = stageLike || filters.some((f) => f && f !== 'none') ? 'stage' : 'coverflow';
    // autoplay period — the interval arg is often a named constant
    // (setInterval(fn, slideDuration)) rather than a literal
    const intervalMs = (() => {
      const m = /setInterval\([^,]+,\s*([A-Za-z_$][\w$]*|\d+)\s*\)/.exec(cfg.html);
      if (!m) return 2500;
      if (/^\d+$/.test(m[1])) return parseInt(m[1]);
      const v = new RegExp(`${m[1]}\\s*=\\s*(\\d+)`).exec(cfg.html);
      return v ? parseInt(v[1]) : 2500;
    })();
    let transitionMs = 600;
    for (const c of common) {
      const re = new RegExp(`\\.${esc(c)}[^{]*\\{[^}]*transition:[^;]*?(\\d*\\.?\\d+)s`, 'i');
      const m = re.exec(cfg.styleText);
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
        pauseOnHover: /clearInterval/.test(cfg.html) && /mouseenter|mouseover/.test(cfg.html),
        variant,
        ...(slideFit && slideFit !== 'cover' ? { slideFit } : {}),
        ...(cardish ? { slideLayout: 'card' } : {}),
        ...(cardWPct != null ? { cardWPct } : {}),
        ...(geom.slideWPct != null ? geom : {}),
      },
    };
  };

  const consumed = new Set<Element>();
  const markConsumed = (node: Element) => {
    consumed.add(node);
    node.querySelectorAll('*').forEach((n) => consumed.add(n));
  };

  // JS-built slice-flip creatives: detection keys on container markup
  // plus a script array of image paths.
  // the slice-flip container is empty at measure time (JS builds it), so
  // it's detected ahead of the main walk — but it must be emitted at the
  // point where the walk reaches its consumed subtree, not at its
  // top-level ancestor: that ancestor is often a plain wrapper <div>
  // containing the bg and every other element, and emitting there would
  // bury the slice under all of them.
  let sliceFlipHost: Element | null = null;
  let sliceFlipPushed = false;
  const detectSliceFlip = (): Record<string, unknown> | null => {
    const sliceHost = D.querySelector(
      '[class*="slices_container"],[class*="slice-inner"],[id*="slice" i]',
    );
    if (!sliceHost || !/rotateY\s*\(/.test(cfg.html)) return null;

    let paths: string[] = [];
    for (const m of cfg.html.matchAll(/=\s*\[((?:[^\]])*)\]/g)) {
      const ps = [...m[1].matchAll(/['"]([^'"]+\.(?:png|jpe?g|gif|webp|svg))['"]/gi)]
        .map((x) => x[1]);
      if (ps.length >= 3) { paths = ps; break; }
    }
    if (paths.length < 3) return null;

    const slides = paths.slice(0, 20).map((p) => ({
      id: uid('sl'),
      assetSrc: registerSrc(p),
      title: '', subtitle: '',
    }));
    if (slides.filter((s) => s.assetSrc).length < 2) return null;

    const host = (sliceHost.parentElement ?? sliceHost) as HTMLElement;
    const r = host.getBoundingClientRect();
    const cfgNum = (names: string[], d: number) => {
      for (const n of names) {
        const m = new RegExp(`${n}\\s*=\\s*(\\d+)`, 'i').exec(cfg.html);
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
      if (sliceFlip && !sliceFlipPushed) { elements.push(sliceFlip); sliceFlipPushed = true; }
      return;
    }
    if (consumed.has(node)) return;
    if (node.classList.contains('clickLayer') || node.id === 'clickLayer') return;

    const style = W.getComputedStyle(node);
    const nodeStyle = (node as HTMLElement).style;
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
      // images can be legitimately slivers (e.g. a 2.5px-wide terms strip);
      // other tags keep the 4px floor to filter decorative noise
      const minDim = node.tagName === 'IMG' ? 2 : 4;
      if (r.width >= minDim && r.height >= minDim) {
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
          // remote/src-attr URLs only — local video files aren't inlined
          // into pathMap (multi-MB data URLs would exceed project storage)
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
          });
          return;
        }

        if (tag === 'IMG') {
          const srcAttr = registerSrc(node.getAttribute('src') ?? '');
          if (srcAttr) {
            elements.push({
              id: uid(), type: 'image', name: node.getAttribute('alt') || 'Image',
              ...base,
              assetSrc: srcAttr,
              fit: style.objectFit === 'cover' || style.objectFit === 'contain' ? style.objectFit : 'fill',
              borderRadius: parseFloat(style.borderRadius) || 0,
            });
            return;
          }
        }

        const bgImg = style.backgroundImage;
        const bgUrl = /url\(["']?(.*?)["']?\)/.exec(bgImg)?.[1] ?? '';
        if (bgUrl) {
          const srcAttr = registerSrc(bgUrl);
          if (srcAttr) {
            elements.push({
              id: uid(), type: 'image', name: 'Background image',
              ...base,
              assetSrc: srcAttr,
              fit: style.backgroundSize === 'contain' ? 'contain' : 'cover',
              borderRadius: parseFloat(style.borderRadius) || 0,
            });
            for (const child of Array.from(node.children)) walk(child);
            return;
          }
        }
        const gradientStop = /gradient\(/.test(bgImg)
          ? /#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(bgImg)?.[0] ?? ''
          : '';
        const gradientFill = gradientStop ? rgbToHex(gradientStop) ?? null : null;
        const gradientAlpha = gradientStop ? alphaOf(gradientStop) : 1;

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
            elements.push({
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
            });
            return;
          }
          elements.push({
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
          });
          return;
        }

        const bgCol = style.backgroundColor;

        // icon-only controls authored via ::before content (slider arrows
        // etc.) — preserve the glyph so they don't import as blank circles
        const clsAttr = `${node.getAttribute('class') ?? ''} ${node.getAttribute('aria-label') ?? ''}`;
        if (tag === 'BUTTON' || /prev|next|arrow|nav|btn/i.test(clsAttr)) {
          let pseudo = '';
          try { pseudo = W.getComputedStyle(node, '::before').content ?? ''; } catch { /* ok */ }
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
            });
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
          const el = {
            id: uid(), type: 'shape', name: node.children.length ? 'Panel' : 'Shape',
            ...base,
            opacity: Math.round(base.opacity * fillAlpha * 1000) / 1000,
            shape: parseFloat(style.borderRadius) > Math.min(w, h) / 2.5 ? 'ellipse' : 'rect',
            fill: fill || 'transparent',
            borderColor: rgbToHex(style.borderColor) ?? 'transparent',
            borderWidth: hasBorder ? Math.round(parseFloat(style.borderWidth)) : 0,
            borderRadius: parseFloat(style.borderRadius) || 0,
          };
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
      if (initiallyHidden) {
        if (savedStyle !== null) node.setAttribute('style', savedStyle);
        else node.removeAttribute('style');
      }
    }
  };

  const sliceFlip = detectSliceFlip();
  for (const child of Array.from(container.children)) walk(child);
  if (sliceFlip && !sliceFlipPushed) elements.push(sliceFlip);

  const ct = /clickTag\s*=\s*['"]([^'"]+)['"]/.exec(cfg.html)?.[1];

  return {
    w: Math.round(crect.width),
    h: Math.round(crect.height),
    bg,
    elements,
    assetSrcs,
    clickTag: ct,
    diag,
  };
}
