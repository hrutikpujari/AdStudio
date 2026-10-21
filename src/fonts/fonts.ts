import type { AssetRef } from '../model/types';

/**
 * Font catalogue + helpers. Two channels bring webfonts into a project:
 *  - `project.googleFonts` — family names served by the Google Fonts css2
 *    API (emitted as a <link> in editor and export)
 *  - `kind:'font'` assets + `project.fontCss` — inline @font-face rules
 *    (uploaded files and imported creatives)
 */

export interface GoogleFont {
  /** family name, e.g. 'Almarai' */
  f: string;
  /** css2 'wght' axis value — discrete list '400;700' or variable range '100..900' */
  w: string;
  cat: 'sans' | 'serif' | 'display';
  /** renders Arabic script */
  ar?: boolean;
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // --- Arabic-capable first: the target market is AR/EN bilingual ---
  { f: 'Almarai', w: '300;400;700;800', cat: 'sans', ar: true },
  { f: 'Cairo', w: '200..1000', cat: 'sans', ar: true },
  { f: 'Tajawal', w: '200;300;400;500;700;800;900', cat: 'sans', ar: true },
  { f: 'IBM Plex Sans Arabic', w: '100;200;300;400;500;600;700', cat: 'sans', ar: true },
  { f: 'Noto Kufi Arabic', w: '100..900', cat: 'sans', ar: true },
  { f: 'Noto Sans Arabic', w: '100..900', cat: 'sans', ar: true },
  { f: 'Readex Pro', w: '160..700', cat: 'sans', ar: true },
  { f: 'Alexandria', w: '100..900', cat: 'sans', ar: true },
  { f: 'Changa', w: '200..800', cat: 'sans', ar: true },
  { f: 'El Messiri', w: '400..700', cat: 'sans', ar: true },
  { f: 'Rubik', w: '300..900', cat: 'sans', ar: true },
  { f: 'Harmattan', w: '400;500;600;700', cat: 'sans', ar: true },
  { f: 'Amiri', w: '400;700', cat: 'serif', ar: true },
  { f: 'Markazi Text', w: '400..700', cat: 'serif', ar: true },
  { f: 'Aref Ruqaa', w: '400;700', cat: 'serif', ar: true },
  { f: 'Reem Kufi', w: '400..700', cat: 'sans', ar: true },
  // --- Latin workhorses ---
  { f: 'Inter', w: '100..900', cat: 'sans' },
  { f: 'Roboto', w: '100;300;400;500;700;900', cat: 'sans' },
  { f: 'Open Sans', w: '300..800', cat: 'sans' },
  { f: 'Montserrat', w: '100..900', cat: 'sans' },
  { f: 'Poppins', w: '100;200;300;400;500;600;700;800;900', cat: 'sans' },
  { f: 'Lato', w: '100;300;400;700;900', cat: 'sans' },
  { f: 'DM Sans', w: '100..1000', cat: 'sans' },
  { f: 'Work Sans', w: '100..900', cat: 'sans' },
  { f: 'Manrope', w: '200..800', cat: 'sans' },
  { f: 'Nunito', w: '200..1000', cat: 'sans' },
  { f: 'Oswald', w: '200..700', cat: 'sans' },
  { f: 'Raleway', w: '100..900', cat: 'sans' },
  { f: 'Archivo', w: '100..900', cat: 'sans' },
  { f: 'Barlow', w: '100..900', cat: 'sans' },
  { f: 'Karla', w: '200..800', cat: 'sans' },
  { f: 'Mulish', w: '200..1000', cat: 'sans' },
  { f: 'Quicksand', w: '300..700', cat: 'sans' },
  { f: 'Urbanist', w: '100..900', cat: 'sans' },
  { f: 'PT Sans', w: '400;700', cat: 'sans' },
  { f: 'Source Sans 3', w: '200..900', cat: 'sans' },
  { f: 'Josefin Sans', w: '100..700', cat: 'sans' },
  { f: 'Cabin', w: '400..700', cat: 'sans' },
  { f: 'Bebas Neue', w: '400', cat: 'display' },
  { f: 'Playfair Display', w: '400..900', cat: 'serif' },
  { f: 'Merriweather', w: '300;400;700;900', cat: 'serif' },
  { f: 'Lora', w: '400..700', cat: 'serif' },
  { f: 'DM Serif Display', w: '400', cat: 'serif' },
  { f: 'Libre Baskerville', w: '400;700', cat: 'serif' },
  { f: 'PT Serif', w: '400;700', cat: 'serif' },
];

export const SYSTEM_FONTS = [
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  'Trebuchet MS, sans-serif',
  'Impact, sans-serif',
  'Courier New, monospace',
];

export function googleFontSpec(family: string): GoogleFont | undefined {
  return GOOGLE_FONTS.find((g) => g.f === family);
}

/** One css2 <link> URL covering every requested family. */
export function googleFontsCssUrl(families: string[]): string | null {
  if (!families.length) return null;
  const fams = families
    .map((f) => {
      const spec = googleFontSpec(f);
      const fam = f.trim().replace(/ /g, '+');
      return spec ? `family=${fam}:wght@${spec.w}` : `family=${fam}`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

/** `'Family', <fallback>` for use in a CSS font-family declaration. */
export function familyStack(family: string): string {
  const spec = googleFontSpec(family);
  const fb = spec?.cat === 'serif' ? 'Georgia, serif' : spec?.cat === 'display' ? 'Arial, sans-serif' : 'Arial, sans-serif';
  return `'${family}', ${fb}`;
}

/** @font-face rules for uploaded font assets (src may be a data URL). */
export function fontFacesFromAssets(assets: AssetRef[]): string {
  return assets
    .filter((a) => a.kind === 'font')
    .map((a) => {
      const family = a.name.replace(/\.(woff2?|ttf|otf|eot)$/i, '').replace(/'/g, '');
      return `@font-face{font-family:'${family}';src:url('${a.src}');font-display:swap}`;
    })
    .join('\n');
}

/** Family names declared by @font-face rules inside a fontCss blob. */
export function familiesInFontCss(fontCss: string | undefined): string[] {
  if (!fontCss) return [];
  const out = new Set<string>();
  const re = /font-family:\s*(['"]?)([^;'"}]+)\1/gi;
  for (const m of fontCss.matchAll(re)) out.add(m[2].trim());
  return [...out];
}
