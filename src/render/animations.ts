import type { AnimationConfig, AnimationPreset } from '../model/types';

/**
 * Animation presets -> CSS keyframes.
 * The same table drives the in-editor canvas preview hints and the
 * generated keyframes in exported creatives.
 */

export const ANIMATION_PRESETS: { id: AnimationPreset; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade-in', label: 'Fade In' },
  { id: 'fade-out', label: 'Fade Out' },
  { id: 'slide-in-left', label: 'Slide In — Left' },
  { id: 'slide-in-right', label: 'Slide In — Right' },
  { id: 'slide-in-top', label: 'Slide In — Top' },
  { id: 'slide-in-bottom', label: 'Slide In — Bottom' },
  { id: 'zoom-in', label: 'Zoom In' },
  { id: 'rotate-in', label: 'Rotate In' },
  { id: 'flip-in-x', label: 'Flip In (X)' },
  { id: 'flip-in-y', label: 'Flip In (Y)' },
  { id: 'bounce-in', label: 'Bounce In' },
  { id: 'pulse', label: 'Pulse (loop)' },
];

const KEYFRAMES: Record<Exclude<AnimationPreset, 'none'>, { name: string; css: string }> = {
  'fade-in': {
    name: 'ap-fade-in',
    css: '0%{opacity:0}100%{opacity:1}',
  },
  'fade-out': {
    name: 'ap-fade-out',
    css: '0%{opacity:1}100%{opacity:0}',
  },
  'slide-in-left': {
    name: 'ap-slide-in-left',
    css: '0%{opacity:0;transform:translateX(-60px)}100%{opacity:1;transform:translateX(0)}',
  },
  'slide-in-right': {
    name: 'ap-slide-in-right',
    css: '0%{opacity:0;transform:translateX(60px)}100%{opacity:1;transform:translateX(0)}',
  },
  'slide-in-top': {
    name: 'ap-slide-in-top',
    css: '0%{opacity:0;transform:translateY(-60px)}100%{opacity:1;transform:translateY(0)}',
  },
  'slide-in-bottom': {
    name: 'ap-slide-in-bottom',
    css: '0%{opacity:0;transform:translateY(60px)}100%{opacity:1;transform:translateY(0)}',
  },
  'zoom-in': {
    name: 'ap-zoom-in',
    css: '0%{opacity:0;transform:scale(0.3)}100%{opacity:1;transform:scale(1)}',
  },
  'rotate-in': {
    name: 'ap-rotate-in',
    css: '0%{opacity:0;transform:rotate(-160deg) scale(0.5)}100%{opacity:1;transform:rotate(0deg) scale(1)}',
  },
  'flip-in-x': {
    name: 'ap-flip-in-x',
    css: '0%{opacity:0;transform:perspective(600px) rotateX(90deg)}100%{opacity:1;transform:perspective(600px) rotateX(0deg)}',
  },
  'flip-in-y': {
    name: 'ap-flip-in-y',
    css: '0%{opacity:0;transform:perspective(600px) rotateY(90deg)}100%{opacity:1;transform:perspective(600px) rotateY(0deg)}',
  },
  'bounce-in': {
    name: 'ap-bounce-in',
    css: '0%{opacity:0;transform:scale(0.3)}55%{opacity:1;transform:scale(1.08)}75%{transform:scale(0.95)}100%{transform:scale(1)}',
  },
  'pulse': {
    name: 'ap-pulse',
    css: '0%,100%{transform:scale(1)}50%{transform:scale(1.06)}',
  },
};

export function keyframesName(preset: AnimationPreset): string | null {
  return preset === 'none' ? null : KEYFRAMES[preset].name;
}

/** CSS for every preset — emitted once into exported creatives. */
export function allKeyframesCSS(): string {
  return Object.values(KEYFRAMES)
    .map((k) => `@keyframes ${k.name}{${k.css}}`)
    .join('\n');
}

/** `animation:` shorthand for an element's config, or ''. */
export function animationShorthand(cfg: AnimationConfig): string {
  if (cfg.preset === 'none') return '';
  const kf = KEYFRAMES[cfg.preset];
  const iter = cfg.preset === 'pulse' && cfg.iterations === 1 ? 'infinite' : cfg.iterations;
  return `${kf.name} ${cfg.duration}ms ${cfg.easing} ${cfg.delay}ms ${iter} ${cfg.direction} both`;
}

/** Total animation timeline length across elements, ms. */
export function timelineDuration(elements: { animation: AnimationConfig }[]): number {
  let max = 0;
  for (const e of elements) {
    const a = e.animation;
    if (a.preset === 'none') continue;
    const iter = a.iterations === 'infinite' ? 1 : a.iterations;
    max = Math.max(max, a.delay + a.duration * iter);
  }
  return Math.max(max, 1000);
}
