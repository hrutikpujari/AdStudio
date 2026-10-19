import type {
  AdElement,
  AnimationConfig,
  AssetRef,
  CreativeProject,
  ElementType,
  ImageElement,
  SlideConfig,
} from './types';

export function uid(prefix = 'el'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export const DEFAULT_ANIMATION: AnimationConfig = {
  preset: 'none',
  delay: 0,
  duration: 800,
  easing: 'ease-out',
  iterations: 1,
  direction: 'normal',
};

export function defaultSlides(count: number): SlideConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid('sl'),
    assetId: undefined,
    title: `ITEM ${i + 1}`,
    subtitle: 'Product description',
    price: String(49 + i * 20),
    oldPrice: String(99 + i * 30),
  }));
}

const base = <T extends ElementType>(
  type: T,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  id: uid(),
  type,
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  animation: { ...DEFAULT_ANIMATION },
});

/**
 * Image element for an asset, sized to the asset's aspect ratio and
 * fitted within ~70% of the artboard. With `center`, the image is
 * centered on that artboard point (drop position); otherwise on the
 * artboard. Always kept inside the artboard bounds.
 */
export function createImageFromAsset(
  asset: AssetRef,
  artW: number,
  artH: number,
  center?: { x: number; y: number },
): ImageElement {
  const nw = asset.width || 140;
  const nh = asset.height || 100;
  const s = Math.min(1, (artW * 0.7) / nw, (artH * 0.7) / nh);
  const w = Math.max(8, Math.round(nw * s));
  const h = Math.max(8, Math.round(nh * s));
  const cx = center ? center.x : artW / 2;
  const cy = center ? center.y : artH / 2;
  const el = createElement('image', artW, artH) as ImageElement;
  return {
    ...el,
    name: asset.name.replace(/\.[a-z0-9]+$/i, '') || 'Image',
    assetId: asset.id,
    width: w,
    height: h,
    x: Math.round(Math.max(0, Math.min(cx - w / 2, artW - w))),
    y: Math.round(Math.max(0, Math.min(cy - h / 2, artH - h))),
  };
}

/** Create an element of the given type, centered-ish on the artboard. */
export function createElement(
  type: ElementType,
  artW: number,
  artH: number,
  at?: { x: number; y: number },
): AdElement {
  const cx = (w: number) => (at ? at.x : Math.round((artW - w) / 2));
  const cy = (h: number) => (at ? at.y : Math.round((artH - h) / 2));

  switch (type) {
    case 'image':
      return {
        ...base('image', 'Image', cx(140), cy(100), 140, 100),
        assetId: undefined,
        fit: 'contain',
        borderRadius: 0,
      };
    case 'text':
      return {
        ...base('text', 'Text', cx(200), Math.max(10, at?.y ?? 20), 200, 40),
        content: 'Your headline',
        fontFamily: 'Arial, sans-serif',
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: 0,
        color: '#1a1a2e',
        textAlign: 'center',
        direction: 'ltr',
        background: 'transparent',
      };
    case 'button':
      return {
        ...base('button', 'CTA Button', cx(140), at?.y ?? artH - 60, 140, 34),
        label: 'Shop Now',
        fontFamily: 'Arial, sans-serif',
        fontSize: 13,
        fontWeight: 700,
        color: '#ffffff',
        background: '#111111',
        borderRadius: 5,
        url: '',
        direction: 'ltr',
      };
    case 'shape':
      return {
        ...base('shape', 'Shape', cx(120), cy(80), 120, 80),
        shape: 'rect',
        fill: '#4f7cff',
        borderColor: 'transparent',
        borderWidth: 0,
        borderRadius: 0,
      };
    case 'carousel':
      return {
        ...base('carousel', 'Carousel', 0, Math.round(artH * 0.4), artW, Math.round(artH * 0.45)),
        config: {
          slides: defaultSlides(5),
          autoplay: true,
          intervalMs: 2500,
          transitionMs: 600,
          pauseOnHover: false,
          variant: 'coverflow',
        },
      };
    case 'card-stack':
      return {
        ...base('card-stack', 'Card Stack', Math.round(artW * 0.08), Math.round(artH * 0.3), Math.round(artW * 0.7), Math.round(artH * 0.55)),
        config: { slides: defaultSlides(6), intervalMs: 3000, transitionMs: 400 },
      };
    case 'fan-carousel':
      return {
        ...base('fan-carousel', 'Fan Carousel', 0, Math.round(artH * 0.4), artW, Math.round(artH * 0.4)),
        config: {
          slides: defaultSlides(7),
          intervalMs: 2000,
          transitionMs: 600,
          pauseOnHover: true,
          spacing: 50,
          fanAngle: 38,
        },
      };
    case 'cube':
      return {
        ...base('cube', 'Rotating Cube', Math.round((artW - 150) / 2), Math.round((artH - 150) / 2), 150, 150),
        config: {
          faces: [undefined, undefined, undefined, undefined, undefined, undefined],
          durationMs: 24000,
          faceSize: 150,
        },
      };
    case 'vertical-slider':
      return {
        ...base('vertical-slider', 'Vertical Slider', Math.round(artW * 0.1), Math.round(artH * 0.25), Math.round(artW * 0.8), Math.round(artH * 0.5)),
        config: {
          slides: defaultSlides(8),
          speed: 0.5,
          pauseOnHover: true,
          pingPong: true,
        },
      };
    case 'slice-flip':
      return {
        ...base('slice-flip', 'Slice Flip', Math.round(artW * 0.18), Math.round(artH * 0.3), Math.round(artW * 0.64), Math.round(artH * 0.48)),
        config: {
          slides: defaultSlides(6),
          sliceCount: 8,
          flipMs: 1200,
          staggerMs: 100,
          holdMs: 3000,
          autoplay: true,
        },
      };
    case 'spotlight':
      return {
        ...base('spotlight', 'Spotlight', 0, 0, artW, artH),
        config: { intensity: 1, beamColor: 'rgba(255,255,240,1)' },
      };
  }
}

export function createProject(name: string, width: number, height: number): CreativeProject {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: uid('prj'),
    name,
    artboard: {
      width,
      height,
      backgroundColor: '#ffffff',
      backgroundFit: 'cover',
    },
    elements: [],
    assets: [],
    clickTag: 'https://www.example.com',
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Templates derived from the inspected creative references            */
/* ------------------------------------------------------------------ */

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  width: number;
  height: number;
  build: () => CreativeProject;
}

function withAnim(el: AdElement, preset: AnimationConfig['preset'], delay: number, duration = 700): AdElement {
  el.animation = { ...el.animation, preset, delay, duration };
  return el;
}

function spotlightBase(w: number, h: number, name: string): CreativeProject {
  const p = createProject(name, w, h);
  p.artboard.backgroundColor = '#b32124';
  return p;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'spotlight-carousel',
    label: 'Spotlight Carousel',
    description: 'Center-stage product carousel under a spotlight beam — Danube 300×250 pattern',
    width: 300,
    height: 250,
    build: () => {
      const p = spotlightBase(300, 250, 'Spotlight Carousel');
      const spot = createElement('spotlight', 300, 250);
      const car = createElement('carousel', 300, 250, { x: 0, y: 70 });
      car.name = 'Product Carousel';
      car.y = 60; car.height = 130;
      (car as any).config.variant = 'stage';
      const cta = withAnim(
        createElement('button', 300, 250, { x: 86, y: 205 }) as AdElement,
        'fade-in', 400,
      );
      cta.x = 86; cta.y = 205; cta.width = 128; cta.height = 18;
      (cta as any).label = 'Visit your nearest store now!';
      (cta as any).fontSize = 9; (cta as any).background = '#000000';
      const title = withAnim(createElement('text', 300, 250, { x: 50, y: 18 }), 'fade-in', 0);
      title.x = 50; title.y = 18; title.width = 200;
      (title as any).content = 'MEGA SALE'; (title as any).color = '#ffffff';
      p.elements = [car, spot as AdElement, title, cta];
      return p;
    },
  },
  {
    id: 'fan-carousel',
    label: 'Fan Carousel',
    description: '3D fanned product cards rotating on a timer — FanCarousel 300×250 pattern',
    width: 300,
    height: 250,
    build: () => {
      const p = createProject('Fan Carousel', 300, 250);
      p.artboard.backgroundColor = 'linear-gradient(135deg,#fff5f5 0%,#ffe8e8 100%)';
      const title = withAnim(createElement('text', 300, 250, { x: 40, y: 20 }), 'slide-in-top', 0);
      (title as any).content = 'Fan Carousel';
      const offer = createElement('shape', 300, 250, { x: 60, y: 55 });
      offer.width = 180; offer.height = 50;
      (offer as any).fill = '#ffffff'; (offer as any).borderColor = '#ffcccc'; (offer as any).borderWidth = 2; (offer as any).borderRadius = 4;
      const fan = createElement('fan-carousel', 300, 250, { x: 0, y: 120 });
      fan.y = 110; fan.height = 100;
      const cta = withAnim(createElement('button', 300, 250, { x: 90, y: 215 }), 'fade-in', 600);
      cta.width = 120; cta.height = 26;
      p.elements = [offer, title, fan, cta];
      return p;
    },
  },
  {
    id: 'cube',
    label: 'Rotating Cube',
    description: 'Six-face 3D cube image rotation — hala cube 336×280 pattern',
    width: 336,
    height: 280,
    build: () => {
      const p = createProject('Rotating Cube', 336, 280);
      const title = withAnim(createElement('text', 336, 280, { x: 68, y: 14 }), 'fade-in', 0);
      const cube = createElement('cube', 336, 280, { x: 93, y: 55 });
      const cta = withAnim(createElement('button', 336, 280, { x: 103, y: 235 }), 'zoom-in', 500);
      cta.width = 130;
      p.elements = [title, cube, cta];
      return p;
    },
  },
  {
    id: 'card-stack',
    label: 'Card Stack',
    description: 'Deck of product cards cycling front-to-back — CarouselCards 300×250 pattern',
    width: 300,
    height: 250,
    build: () => {
      const p = createProject('Card Stack', 300, 250);
      const title = withAnim(createElement('text', 300, 250, { x: 50, y: 24 }), 'fade-in', 0);
      const stack = createElement('card-stack', 300, 250, { x: 20, y: 70 });
      const cta = withAnim(createElement('button', 300, 250, { x: 90, y: 216 }), 'bounce-in', 500);
      cta.width = 120; cta.height = 26;
      p.elements = [title, stack, cta];
      return p;
    },
  },
  {
    id: 'vertical-feed',
    label: 'Vertical Product Feed',
    description: 'Continuously scrolling product list — VerticalSlider 300×600 pattern',
    width: 300,
    height: 600,
    build: () => {
      const p = createProject('Vertical Product Feed', 300, 600);
      const title = withAnim(createElement('text', 300, 600, { x: 50, y: 40 }), 'slide-in-top', 0);
      (title as any).content = 'Top Picks'; (title as any).fontSize = 20;
      const vs = createElement('vertical-slider', 300, 600, { x: 30, y: 120 });
      vs.width = 240; vs.height = 380;
      const cta = withAnim(createElement('button', 300, 600, { x: 85, y: 540 }), 'fade-in', 700);
      cta.width = 130; cta.height = 30;
      p.elements = [title, vs, cta];
      return p;
    },
  },
];
