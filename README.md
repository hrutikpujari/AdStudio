# AdPilot Studio

Visual HTML5 advertising creative builder. Drag elements onto a fixed-size
artboard, style them, attach preset animations on a timeline, preview the
creative, and export a standalone HTML5 ZIP.

## Stack

- **Vite 7 + React 19 + TypeScript** — editor UI
- **Zustand** — project state, undo/redo history, localStorage persistence
- **JSZip** — HTML5 ZIP export
- **Zod** — project & AI-output schema validation
- **lucide-react** — icons
- No drag library: canvas hit-testing is geometry-based (`Artboard.tsx`),
  which is what makes click-through selection on overlapping elements reliable.

## Commands

```bash
npm run dev      # editor at http://localhost:5173
npm run build    # typecheck + production build
npm run smoke    # headless test: generates HTML for every template/component
```

## Architecture

```
src/
  model/
    types.ts        CreativeProject, AdElement union, component configs
    defaults.ts     element factories, ad-size presets, starter templates
    schema.ts       zod schema — validates saved drafts & AI output
  store/
    projectStore.ts zustand: CRUD, selection, undo/redo (gesture-aware),
                    autosave to localStorage
    uiStore.ts      toasts
  render/
    animations.ts   preset -> CSS keyframes (single source of truth)
    ElementView.tsx static canvas renderer per element type
  editor/
    EditorLayout    wiring: zoom/fit, keyboard, preview state, dialogs
    Artboard        artboard coordinates, drop target, overlap click-through
    CanvasElement   selection outline + 8 resize handles
    ElementsPanel   palette (drag or click-to-add) + asset upload
    LayersPanel     rename/visibility/lock/duplicate/reorder
    PropertiesPanel contextual inspector + animation + slides editors
    TimelinePanel   tracks, ruler, scrub, playhead
    PreviewOverlay  sandboxed iframe running the exported HTML
  export/
    generateHtml.ts project -> standalone index.html (the ONLY renderer
                    used by both preview and export)
    exportZip.ts    JSZip packaging, data-URL assets -> imgs/*
    validate.ts     pre-export checks
  ai/
    mockAi.ts       rule-based prompt -> project JSON (see "AI" below)
```

### Data flow

`CreativeProject` (plain JSON) is the single source of truth.
The canvas renders it read-only; every mutation goes through the store
(→ history snapshot + autosave). Preview and export both call
`generateHtml(project, assetUrl)` — the preview just passes data-URL asset
sources while the ZIP exporter passes `imgs/...` paths and bundles the bytes.

### Animation model

Each element carries an `AnimationConfig` (preset, delay, duration, easing,
iterations, direction). Presets map to CSS `@keyframes` in
`render/animations.ts`; the exporter emits them once and applies
`animation: name duration easing delay iterations direction both` to the
element's `.ap-anim` inner div (the outer `.ap-el` owns position/rotation so
transform animations never fight layout). Timeline scrubbing works by
emitting `animation-delay: (delay - t)ms; animation-play-state: paused`.

### Component runtimes

Advanced components (carousel, card stack, fan, cube, vertical feed,
spotlight) emit scoped CSS under `#css-{elementId}` plus a small vanilla-JS
IIFE runtime — the same class-state technique as the reference creatives
(`center/left/right/hidden` for coverflow, computed transforms for the fan,
`@keyframes` spin for the cube, rAF scroll for the vertical feed).

## Opening existing creatives

`Open` dialog → *Import a creative file*, three paths:

- **ZIP** — Studio-exported ZIPs contain `project.json` and restore at full
  fidelity (elements, components, animations, assets). Foreign ZIPs fall
  back to the flattened importer below.
- **HTML** — a single `.html` creative (relative asset paths resolve only
  if inlined as data URLs or remote).
- **Folder** — pick a creative folder (`index.html` + `imgs/`); every
  image/font is imported as an asset.

Foreign HTML is flattened: scripts are stripped, the file renders in a
hidden sandboxed iframe, and each visible node's computed bounds are
measured to synthesize elements (`<img>`→image, text leaves→text,
buttons/links→CTA, filled containers→shapes). JS-driven animation states
collapse to their first frame — rebuild carousels/cubes as components
after import.

## Persistence

Drafts autosave to `localStorage` (`adpilot.*` keys) with a 800 ms debounce,
validated through the zod schema on load so corrupted data can't crash the
editor. The `CreativeProject` shape is backend-ready: flat JSON, stable ids,
no functions — a future Spring Boot API can persist it as-is (suggest
`POST/GET /api/projects` storing the document in a `jsonb` column).

## AI integration

`src/ai/mockAi.ts` is a clearly separated mock: it parses keywords from the
prompt (size, layout, component types, CTA language) and produces a
schema-validated `CreativeProject`. To connect a real model:

1. Backend endpoint (e.g. Spring Boot): `POST /api/ai/generate`
   `{ prompt, schema }` → LLM → `CreativeProject` JSON.
   Keep API keys server-side; never bundle them.
2. Replace `generateFromPrompt` internals with `fetch('/api/ai/generate', …)`.
3. Keep the `validateProject()` call on the response — it is what makes
   arbitrary model output safe to apply. Never eval generated code.

## Ad platform notes

Exported creatives include `var clickTag`, an `.ad-container` click binding
(`window.open(clickTag, '_blank')`), `.clickLayer`, and the
`<meta name="ad.size">` tag — matching the reference-creative conventions.
`Validate` checks dimensions, missing/mismatched assets, invalid URLs and
off-artboard elements. **Not covered** (verify manually per network): total
file weight limits (DV360 commonly ~150 KB initial + polite load), SSL-only
asset hosting, backup-image requirements, MRAID for in-app inventory, and
loop-count/time caps (often 15–30 s or 3 loops).

## Security

- Uploaded assets: images only, ≤ 2.5 MB, stored as data URLs.
- Preview iframe: `sandbox="allow-scripts allow-popups"` — ad runtime JS
  works and clickTag popups are testable, but the creative has no
  same-origin access to the editor.
- Text/labels are HTML-escaped at export; clickTag is restricted to
  `http(s):`/`mailto:` — `javascript:` URLs are rejected by validation.
- AI output is validated JSON, never executed.

## Keyboard

`Ctrl+Z` undo · `Ctrl+Y`/`Ctrl+Shift+Z` redo · `Ctrl+D` duplicate ·
`Ctrl+S` save · `Delete` remove · arrows nudge (`Shift` = 10px) · `Esc` close
