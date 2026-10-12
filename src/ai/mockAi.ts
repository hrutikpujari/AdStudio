import type {
  AdElement,
  ButtonElement,
  CarouselElement,
  CreativeProject,
  TextElement,
} from '../model/types';
import { createElement, createProject, uid } from '../model/defaults';
import { validateProject } from '../model/schema';

/**
 * AI creative generation — MOCK implementation.
 *
 * Real integration seam: replace `generateFromPrompt` with a POST to your
 * backend (e.g. Spring Boot `/api/ai/generate`) that calls an LLM with the
 * prompt + the element/animation schema (see model/schema.ts) and returns
 * a CreativeProject-shaped JSON. The response still flows through
 * validateProject() here, so malformed model output is rejected before it
 * can touch the editor. Never send API keys from the frontend bundle.
 */

interface AiResult {
  ok: boolean;
  project?: CreativeProject;
  errors?: string[];
  summary?: string;
}

const SIZE_RE = /(\d{2,4})\s*[x×]\s*(\d{2,4})/i;

export async function generateFromPrompt(
  prompt: string,
  current: CreativeProject,
): Promise<AiResult> {
  // simulate a network round-trip
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));

  const p = prompt.toLowerCase();
  const m = SIZE_RE.exec(p);
  const w = m ? Math.min(2000, parseInt(m[1])) : current.artboard.width;
  const h = m ? Math.min(2000, parseInt(m[2])) : current.artboard.height;

  const project = createProject(`AI — ${prompt.slice(0, 40) || 'creative'}`, w, h);
  const elements: AdElement[] = [];

  // background
  if (/blur|blurred/.test(p)) {
    project.artboard.backgroundColor = '#3a4a6b';
  } else if (/dark|black|night/.test(p)) {
    project.artboard.backgroundColor = '#15161c';
  } else if (/red|sale|retail/.test(p)) {
    project.artboard.backgroundColor = '#b32124';
  } else if (/blue/.test(p)) {
    project.artboard.backgroundColor = '#12447a';
  } else if (/gradient/.test(p)) {
    project.artboard.backgroundColor = 'linear-gradient(135deg,#e6f7ff 0%,#d6f0ff 100%)';
  }

  const usedY = { v: 0 };
  const band = (height: number, at?: 'top' | 'bottom') => {
    if (at === 'bottom') return h - height - 12;
    const y = 12 + usedY.v;
    usedY.v += height + 10;
    return y;
  };

  // logo → image element top-right
  if (/logo/.test(p)) {
    const el = createElement('image', w, h);
    el.name = 'Logo';
    el.width = Math.round(w * 0.3);
    el.height = Math.round(h * 0.12);
    el.x = w - el.width - 10;
    el.y = 10;
    el.animation = { ...el.animation, preset: 'fade-in', delay: 0, duration: 600 };
    elements.push(el);
  }

  // headline text
  const headline = /arabic|عرب/.test(p)
    ? 'عروض خاصة'
    : /sale|retail|offer|discount/.test(p) ? 'MEGA SALE' : 'Your headline here';
  const title = createElement('text', w, h) as TextElement;
  title.name = 'Headline';
  title.content = headline;
  title.fontSize = Math.max(14, Math.round(w / 18));
  title.x = Math.round(w * 0.08);
  title.width = Math.round(w * 0.84);
  title.y = /logo/.test(p) ? Math.round(h * 0.16) : band(40);
  title.height = Math.round(h * 0.14);
  if (/arabic|rtl|عرب/.test(p)) title.direction = 'rtl';
  if (/(dark|black|night|red|sale|retail|blue|blur)/.test(p)) title.color = '#ffffff';
  title.animation = { ...title.animation, preset: /slide/.test(p) ? 'slide-in-top' : 'fade-in', delay: 100, duration: 700 };
  elements.push(title);

  // main visual component
  if (/cube|3d/.test(p)) {
    const el = createElement('cube', w, h);
    el.name = 'Product Cube';
    el.y = Math.round(h * 0.3);
    elements.push(el);
  } else if (/fan/.test(p)) {
    const el = createElement('fan-carousel', w, h);
    el.y = Math.round(h * 0.35);
    elements.push(el);
  } else if (/stack/.test(p)) {
    const el = createElement('card-stack', w, h);
    elements.push(el);
  } else if (/vertical|feed|list/.test(p)) {
    const el = createElement('vertical-slider', w, h);
    elements.push(el);
  } else {
    // carousel is the default multi-product pattern
    const el = createElement('carousel', w, h) as CarouselElement;
    el.name = 'Product Carousel';
    el.y = Math.round(h * 0.32);
    el.height = Math.round(h * 0.45);
    if (/stage|spotlight|dim/.test(p)) el.config.variant = 'stage';
    const slideCount = /three|3/.test(p) ? 3 : /four|4/.test(p) ? 4 : 5;
    el.config.slides = el.config.slides.slice(0, slideCount);
    elements.push(el);
  }

  if (/spotlight/.test(p)) {
    elements.push(createElement('spotlight', w, h));
  }

  // CTA
  const cta = createElement('button', w, h) as ButtonElement;
  cta.name = 'CTA';
  cta.label = /arabic|عرب/.test(p) ? 'تسوق الآن' : /visit|store/.test(p) ? 'Visit Store' : 'Shop Now';
  cta.y = band(cta.height, 'bottom');
  cta.x = Math.round((w - cta.width) / 2);
  cta.animation = { ...cta.animation, preset: /bounce/.test(p) ? 'bounce-in' : 'fade-in', delay: 600, duration: 700 };
  elements.push(cta);

  project.elements = elements;
  project.id = uid('prj');

  const res = validateProject(project);
  if (!res.ok) return { ok: false, errors: res.errors };
  return {
    ok: true,
    project: res.project,
    summary:
      `Mock AI generated a ${w}×${h} creative with ${elements.length} element(s): ` +
      elements.map((e) => e.name).join(', ') +
      '. Assign images in the Assets panel to finish it.',
  };
}
