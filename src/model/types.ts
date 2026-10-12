/**
 * AdPilot Studio — canonical project data model.
 *
 * A CreativeProject is a plain serializable JSON document. Everything the
 * editor shows, everything the preview plays, and everything the exporter
 * emits is derived from this structure. The same shape is intended to be
 * persistable later through a REST API + PostgreSQL.
 */

export type ElementType =
  | 'image'
  | 'text'
  | 'button'
  | 'shape'
  | 'carousel'        // cover-flow style: center/left/right/hidden (CarouselSlider + Spotlight refs)
  | 'card-stack'      // deck of cards, top card exits to back (CarouselCardsStack ref)
  | 'fan-carousel'    // 3D rotateY fan (FanCarousel ref)
  | 'cube'            // rotating 3D cube, 6 faces (hala cube ref)
  | 'vertical-slider' // continuous vertical auto-scroll track (VerticalSlider ref)
  | 'spotlight';      // spotlight overlay effect layered above other content

export type AnimationPreset =
  | 'none'
  | 'fade-in'
  | 'fade-out'
  | 'slide-in-left'
  | 'slide-in-right'
  | 'slide-in-top'
  | 'slide-in-bottom'
  | 'zoom-in'
  | 'rotate-in'
  | 'flip-in-x'
  | 'flip-in-y'
  | 'bounce-in'
  | 'pulse';

export type EasingName =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'cubic-bezier(0.25,0.46,0.45,0.94)'  // easeOutQuad-ish, used in refs
  | 'cubic-bezier(0.4,0,0.2,1)';        // standard, used in fan ref

export interface AnimationConfig {
  preset: AnimationPreset;
  /** ms before the animation starts */
  delay: number;
  /** ms duration of a single iteration */
  duration: number;
  easing: EasingName;
  /** iteration count; 'infinite' for looping presets like pulse */
  iterations: number | 'infinite';
  /** css animation-direction */
  direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
}

export interface AssetRef {
  id: string;
  name: string;
  /** 'image' assets are stored as data URLs so exports are self-contained */
  kind: 'image' | 'font';
  mimeType: string;
  /** data: URL for locally uploaded assets, or an https URL for remote assets */
  src: string;
  width?: number;
  height?: number;
}

export interface SlideConfig {
  id: string;
  assetId?: string;   // image for the slide; empty -> placeholder
  title: string;
  subtitle: string;
  price?: string;     // used by vertical-slider product cards
  oldPrice?: string;
}

export interface CarouselConfig {
  slides: SlideConfig[];
  autoplay: boolean;
  intervalMs: number;
  transitionMs: number;
  /** pause autoplay when the pointer is over the component */
  pauseOnHover: boolean;
  /** 'coverflow' = clean 75%/scale(.8) side cards (CarouselSlider ref);
   *  'stage' = wider offset, heavy dim filter (Danube Spotlight ref) */
  variant: 'coverflow' | 'stage';
}

export interface CardStackConfig {
  slides: SlideConfig[];
  intervalMs: number;
  transitionMs: number;
}

export interface FanConfig {
  slides: SlideConfig[];
  intervalMs: number;
  transitionMs: number;
  pauseOnHover: boolean;
  /** horizontal spacing between adjacent cards, px */
  spacing: number;
  /** rotateY degrees per offset step */
  fanAngle: number;
}

export interface CubeConfig {
  /** up to 6 face images; empty slots reuse a placeholder */
  faces: (string | undefined)[]; // assetIds, length 6: front,back,right,left,top,bottom
  durationMs: number;            // full rotation cycle
  faceSize: number;              // px edge of the cube
}

export interface VerticalSliderConfig {
  slides: SlideConfig[];
  /** slides per second scroll speed (fractional ok, e.g. 0.5) */
  speed: number;
  pauseOnHover: boolean;
  pingPong: boolean;
}

export interface SpotlightConfig {
  /** visual intensity of the beam/pool/vignette, 0-1 */
  intensity: number;
  beamColor: string;
}

interface BaseElement {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;   // degrees
  opacity: number;    // 0-1
  visible: boolean;
  locked: boolean;
  animation: AnimationConfig;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  assetId?: string;
  fit: 'contain' | 'cover' | 'fill';
  borderRadius: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  direction: 'ltr' | 'rtl';
  background: string; // 'transparent' or css color
}

export interface ButtonElement extends BaseElement {
  type: 'button';
  label: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  background: string;
  borderRadius: number;
  /** per-element click-through URL; empty -> project clickTag */
  url: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  fill: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export interface CarouselElement extends BaseElement {
  type: 'carousel';
  config: CarouselConfig;
}

export interface CardStackElement extends BaseElement {
  type: 'card-stack';
  config: CardStackConfig;
}

export interface FanElement extends BaseElement {
  type: 'fan-carousel';
  config: FanConfig;
}

export interface CubeElement extends BaseElement {
  type: 'cube';
  config: CubeConfig;
}

export interface VerticalSliderElement extends BaseElement {
  type: 'vertical-slider';
  config: VerticalSliderConfig;
}

export interface SpotlightElement extends BaseElement {
  type: 'spotlight';
  config: SpotlightConfig;
}

export type AdElement =
  | ImageElement
  | TextElement
  | ButtonElement
  | ShapeElement
  | CarouselElement
  | CardStackElement
  | FanElement
  | CubeElement
  | VerticalSliderElement
  | SpotlightElement;

export interface ArtboardSettings {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImageAssetId?: string;
  backgroundFit: 'cover' | 'contain' | 'fill';
}

export interface CreativeProject {
  schemaVersion: 1;
  id: string;
  name: string;
  artboard: ArtboardSettings;
  /** z-order: index 0 = bottom, last = top */
  elements: AdElement[];
  assets: AssetRef[];
  /** global click-through; element-level urls take precedence */
  clickTag: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
}

export const AD_SIZES = [
  { w: 300, h: 250, label: '300 × 250 — Medium Rectangle' },
  { w: 336, h: 280, label: '336 × 280 — Large Rectangle' },
  { w: 300, h: 600, label: '300 × 600 — Half Page' },
  { w: 728, h: 90, label: '728 × 90 — Leaderboard' },
  { w: 320, h: 50, label: '320 × 50 — Mobile Banner' },
  { w: 320, h: 100, label: '320 × 100 — Large Mobile Banner' },
] as const;

export const ADVANCED_TYPES: ElementType[] = [
  'carousel', 'card-stack', 'fan-carousel', 'cube', 'vertical-slider', 'spotlight',
];

export function isAdvanced(t: ElementType): boolean {
  return ADVANCED_TYPES.includes(t);
}
