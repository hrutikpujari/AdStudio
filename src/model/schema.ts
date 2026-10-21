import { z } from 'zod';
import type { CreativeProject } from './types';

const animationSchema = z.object({
  preset: z.enum([
    'none', 'fade-in', 'fade-out',
    'slide-in-left', 'slide-in-right', 'slide-in-top', 'slide-in-bottom',
    'zoom-in', 'rotate-in', 'flip-in-x', 'flip-in-y', 'bounce-in', 'pulse',
    'pane-in-right', 'pane-out-left',
  ]),
  delay: z.number().min(0).max(60000),
  duration: z.number().min(50).max(60000),
  easing: z.string().max(80),
  iterations: z.union([z.number().min(1).max(100), z.literal('infinite')]),
  direction: z.enum(['normal', 'reverse', 'alternate', 'alternate-reverse']),
});

const baseElement = {
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  width: z.number().min(1).max(5000),
  height: z.number().min(1).max(5000),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  animation: animationSchema,
};

const slideSchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().max(64).optional(),
  title: z.string().max(200),
  subtitle: z.string().max(300),
  price: z.string().max(40).optional(),
  oldPrice: z.string().max(40).optional(),
  ctaLabel: z.string().max(80).optional(),
  url: z.string().max(2000).optional(),
});

const elementSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseElement,
    type: z.literal('image'),
    assetId: z.string().max(64).optional(),
    fit: z.enum(['contain', 'cover', 'fill']),
    borderRadius: z.number().min(0).max(500),
  }),
  z.object({
    ...baseElement,
    type: z.literal('video'),
    src: z.string().max(4_000_000),
    fit: z.enum(['contain', 'cover', 'fill']),
    autoplay: z.boolean(),
    loop: z.boolean(),
    muted: z.boolean(),
  }),
  z.object({
    ...baseElement,
    type: z.literal('text'),
    content: z.string().max(2000),
    fontFamily: z.string().max(120),
    fontSize: z.number().min(4).max(200),
    fontWeight: z.number().min(100).max(900),
    lineHeight: z.number().min(0.5).max(4),
    letterSpacing: z.number().min(-10).max(50),
    color: z.string().max(60),
    textAlign: z.enum(['left', 'center', 'right']),
    direction: z.enum(['ltr', 'rtl']),
    background: z.string().max(60),
  }),
  z.object({
    ...baseElement,
    type: z.literal('button'),
    label: z.string().max(200),
    fontFamily: z.string().max(120),
    fontSize: z.number().min(4).max(100),
    fontWeight: z.number().min(100).max(900),
    color: z.string().max(60),
    background: z.string().max(60),
    borderRadius: z.number().min(0).max(200),
    url: z.string().max(2000),
    direction: z.enum(['ltr', 'rtl']).default('ltr'),
  }),
  z.object({
    ...baseElement,
    type: z.literal('shape'),
    shape: z.enum(['rect', 'ellipse', 'line']),
    fill: z.string().max(200),
    borderColor: z.string().max(60),
    borderWidth: z.number().min(0).max(50),
    borderRadius: z.number().min(0).max(500),
  }),
  z.object({
    ...baseElement,
    type: z.literal('carousel'),
    config: z.object({
      slides: z.array(slideSchema).min(1).max(20),
      autoplay: z.boolean(),
      intervalMs: z.number().min(200).max(60000),
      transitionMs: z.number().min(50).max(10000),
      pauseOnHover: z.boolean(),
      variant: z.enum(['coverflow', 'stage', 'track']),
      slideWPct: z.number().min(5).max(200).optional(),
      slideHPct: z.number().min(5).max(200).optional(),
      sideXPct: z.number().min(0).max(500).optional(),
      sideScale: z.number().min(0.05).max(1.5).optional(),
      slideFit: z.enum(['fill', 'contain', 'cover', 'none', 'scale-down']).optional(),
      slideLayout: z.enum(['plain', 'card']).optional(),
      cardWPct: z.number().min(20).max(100).optional(),
      cardFontFamily: z.string().max(200).optional(),
      cardDir: z.enum(['ltr', 'rtl']).optional(),
      cardTitleColor: z.string().max(60).optional(),
      cardPriceColor: z.string().max(60).optional(),
      cardOldPriceColor: z.string().max(60).optional(),
      cardCtaBg: z.string().max(60).optional(),
      cardCtaColor: z.string().max(60).optional(),
      cardTitlePx: z.number().min(4).max(200).optional(),
      cardPricePx: z.number().min(4).max(200).optional(),
      cardCtaPx: z.number().min(4).max(100).optional(),
      cardImgPx: z.number().min(10).max(800).optional(),
      cardPadPx: z.number().min(0).max(100).optional(),
      cardCtaRadiusPx: z.number().min(0).max(60).optional(),
      cardTitleAlign: z.enum(['left', 'center', 'right']).optional(),
    }),
  }),
  z.object({
    ...baseElement,
    type: z.literal('card-stack'),
    config: z.object({
      slides: z.array(slideSchema).min(2).max(12),
      intervalMs: z.number().min(200).max(60000),
      transitionMs: z.number().min(50).max(10000),
    }),
  }),
  z.object({
    ...baseElement,
    type: z.literal('fan-carousel'),
    config: z.object({
      slides: z.array(slideSchema).min(2).max(20),
      intervalMs: z.number().min(200).max(60000),
      transitionMs: z.number().min(50).max(10000),
      pauseOnHover: z.boolean(),
      spacing: z.number().min(0).max(300),
      fanAngle: z.number().min(0).max(80),
    }),
  }),
  z.object({
    ...baseElement,
    type: z.literal('cube'),
    config: z.object({
      faces: z.array(z.string().max(64).nullish()).length(6),
      durationMs: z.number().min(500).max(120000),
      faceSize: z.number().min(20).max(2000),
    }),
  }),
  z.object({
    ...baseElement,
    type: z.literal('vertical-slider'),
    config: z.object({
      slides: z.array(slideSchema).min(2).max(50),
      speed: z.number().min(0.05).max(10),
      pauseOnHover: z.boolean(),
      pingPong: z.boolean(),
    }),
  }),
  z.object({
    ...baseElement,
    type: z.literal('slice-flip'),
    config: z.object({
      slides: z.array(slideSchema).min(2).max(20),
      sliceCount: z.number().min(2).max(20),
      flipMs: z.number().min(100).max(10000),
      staggerMs: z.number().min(0).max(2000),
      holdMs: z.number().min(200).max(60000),
      autoplay: z.boolean(),
    }),
  }),
  z.object({
    ...baseElement,
    type: z.literal('spotlight'),
    config: z.object({
      intensity: z.number().min(0).max(1),
      beamColor: z.string().max(60),
    }),
  }),
]);

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  artboard: z.object({
    width: z.number().min(10).max(3000),
    height: z.number().min(10).max(3000),
    backgroundColor: z.string().max(300),
    backgroundImageAssetId: z.string().max(64).optional(),
    backgroundFit: z.enum(['cover', 'contain', 'fill']),
  }),
  elements: z.array(elementSchema).max(200),
  assets: z.array(
    z.object({
      id: z.string().min(1).max(64),
      name: z.string().max(300),
      kind: z.enum(['image', 'font']),
      mimeType: z.string().max(100),
      src: z.string().max(4_000_000),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  ).max(200),
  clickTag: z.string().max(2000),
  fontCss: z.string().max(200_000).optional(),
  googleFonts: z.array(z.string().max(120)).max(60).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ParseResult =
  | { ok: true; project: CreativeProject }
  | { ok: false; errors: string[] };

/** Validate an unknown value as a CreativeProject. Used for saved
 *  drafts and AI-generated configurations. */
export function validateProject(raw: unknown): ParseResult {
  const res = projectSchema.safeParse(raw);
  if (res.success) {
    return { ok: true, project: res.data as CreativeProject };
  }
  const errors = res.error.issues
    .slice(0, 12)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, errors };
}
