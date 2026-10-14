import type { ChangeEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AdElement,
  AnimationPreset,
  EasingName,
  SlideConfig,
} from '../model/types';
import { ANIMATION_PRESETS } from '../render/animations';
import { uid } from '../model/defaults';
import { useEditor, useSelectedElement } from '../store/projectStore';

const EASINGS: { value: EasingName; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease', label: 'Ease' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'cubic-bezier(0.25,0.46,0.45,0.94)', label: 'Ease Out Quad' },
  { value: 'cubic-bezier(0.4,0,0.2,1)', label: 'Standard' },
];

const FONTS = [
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  'Trebuchet MS, sans-serif',
  'Impact, sans-serif',
  'Courier New, monospace',
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Num({ value, onChange, min, max, step }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <input
      type="number"
      value={Math.round(value * 100) / 100}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

function AssetSelect({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const assets = useEditor((s) => s.project.assets);
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={{ flex: 1 }}
    >
      <option value="">— none —</option>
      {assets.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}

function SlidesEditor({ el }: { el: AdElement & { config: any } }) {
  const updateElementConfig = useEditor((s) => s.updateElementConfig);
  const assets = useEditor((s) => s.project.assets);
  const slides: SlideConfig[] = el.config.slides;
  const showPrices = el.type === 'vertical-slider';

  const setSlides = (slides: SlideConfig[]) =>
    updateElementConfig(el.id, { slides });

  const patch = (i: number, p: Partial<SlideConfig>) =>
    setSlides(slides.map((s, j) => (j === i ? { ...s, ...p } : s)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const copy = [...slides];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setSlides(copy);
  };

  return (
    <div className="prop-group">
      <h4>Slides ({slides.length})</h4>
      {slides.map((s, i) => {
        const src = s.assetId ? assets.find((a) => a.id === s.assetId)?.src : '';
        return (
          <div key={s.id} style={{ marginBottom: 8 }}>
            <div className="slide-row">
              <div className="thumb">
                {src ? <img src={src} alt="" /> : <span>{i + 1}</span>}
              </div>
              <input value={s.title} placeholder="Title" onChange={(e) => patch(i, { title: e.target.value })} />
              <button className="icon-btn" onClick={() => move(i, -1)} title="Move up"><ArrowUp size={11} /></button>
              <button className="icon-btn" onClick={() => move(i, 1)} title="Move down"><ArrowDown size={11} /></button>
              <button className="icon-btn" onClick={() => slides.length > 1 && setSlides(slides.filter((_, j) => j !== i))} title="Remove slide"><Trash2 size={11} /></button>
            </div>
            <div className="slide-row">
              <select
                value={s.assetId ?? ''}
                onChange={(e) => patch(i, { assetId: e.target.value || undefined })}
                style={{ width: '100%' }}
              >
                <option value="">placeholder</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="slide-row">
              <input value={s.subtitle} placeholder="Subtitle" onChange={(e) => patch(i, { subtitle: e.target.value })} />
            </div>
            {showPrices && (
              <div className="slide-row">
                <input value={s.price ?? ''} placeholder="Price" onChange={(e) => patch(i, { price: e.target.value })} />
                <input value={s.oldPrice ?? ''} placeholder="Old price" onChange={(e) => patch(i, { oldPrice: e.target.value })} />
              </div>
            )}
          </div>
        );
      })}
      <button
        className="mini-btn"
        onClick={() => setSlides([...slides, { id: uid('sl'), title: `ITEM ${slides.length + 1}`, subtitle: 'Product description', price: '99', oldPrice: '149' }])}
      >
        <Plus size={11} style={{ verticalAlign: -1 }} /> Add slide
      </button>
    </div>
  );
}

function AnimationSection({ el }: { el: AdElement }) {
  const updateElement = useEditor((s) => s.updateElement);
  const a = el.animation;
  const set = (p: Partial<typeof a>) => updateElement(el.id, { animation: { ...a, ...p } });
  return (
    <div className="prop-group">
      <h4>Animation</h4>
      <Row label="Preset">
        <select value={a.preset} onChange={(e) => set({ preset: e.target.value as AnimationPreset })}>
          {ANIMATION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Row>
      {a.preset !== 'none' && (
        <>
          <Row label="Delay">
            <Num value={a.delay} min={0} max={60000} step={50} onChange={(v) => set({ delay: v })} />
            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span>
          </Row>
          <Row label="Duration">
            <Num value={a.duration} min={50} max={60000} step={50} onChange={(v) => set({ duration: v })} />
            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span>
          </Row>
          <Row label="Easing">
            <select value={a.easing} onChange={(e) => set({ easing: e.target.value as EasingName })}>
              {EASINGS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </Row>
          <Row label="Repeat">
            <select
              value={a.iterations === 'infinite' ? 'infinite' : 'count'}
              onChange={(e) => set({ iterations: e.target.value === 'infinite' ? 'infinite' : 1 })}
            >
              <option value="count">Times</option>
              <option value="infinite">Loop</option>
            </select>
            {a.iterations !== 'infinite' && (
              <Num value={a.iterations} min={1} max={100} onChange={(v) => set({ iterations: Math.round(v) })} />
            )}
          </Row>
          <Row label="Direction">
            <select value={a.direction} onChange={(e) => set({ direction: e.target.value as any })}>
              <option value="normal">Normal</option>
              <option value="reverse">Reverse</option>
              <option value="alternate">Alternate</option>
              <option value="alternate-reverse">Alt-Reverse</option>
            </select>
          </Row>
        </>
      )}
    </div>
  );
}

function ArtboardProps() {
  const project = useEditor((s) => s.project);
  const setArtboard = useEditor((s) => s.setArtboard);
  const setClickTag = useEditor((s) => s.setClickTag);
  const a = project.artboard;
  return (
    <>
      <div className="prop-group">
        <h4>Artboard</h4>
        <Row label="Size">
          <div className="prop-pair">
            <Num value={a.width} min={10} max={3000} onChange={(v) => setArtboard({ width: Math.round(v) })} />
            <Num value={a.height} min={10} max={3000} onChange={(v) => setArtboard({ height: Math.round(v) })} />
          </div>
        </Row>
        <Row label="Background">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(a.backgroundColor) ? a.backgroundColor : '#ffffff'}
            onChange={(e) => setArtboard({ backgroundColor: e.target.value })}
          />
          <input
            type="text"
            value={a.backgroundColor}
            onChange={(e) => setArtboard({ backgroundColor: e.target.value })}
            placeholder="#ffffff or gradient"
          />
        </Row>
        <Row label="BG image">
          <AssetSelect value={a.backgroundImageAssetId} onChange={(v) => setArtboard({ backgroundImageAssetId: v })} />
        </Row>
        <Row label="BG fit">
          <select value={a.backgroundFit} onChange={(e) => setArtboard({ backgroundFit: e.target.value as any })}>
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fill">Fill</option>
          </select>
        </Row>
      </div>
      <div className="prop-group">
        <h4>Click-through</h4>
        <Row label="clickTag">
          <input
            type="text"
            value={project.clickTag}
            onChange={(e) => setClickTag(e.target.value)}
            placeholder="https://…"
          />
        </Row>
      </div>
    </>
  );
}

export function PropertiesPanel() {
  const el = useSelectedElement();
  const updateElement = useEditor((s) => s.updateElement);
  const updateElementConfig = useEditor((s) => s.updateElementConfig);
  const reorderElement = useEditor((s) => s.reorderElement);
  const assets = useEditor((s) => s.project.assets);

  if (!el) {
    return (
      <>
        <div className="panel-head"><span>Properties</span></div>
        <ArtboardProps />
      </>
    );
  }

  const set = (p: Partial<AdElement>) => updateElement(el.id, p);
  const setCfg = (p: Record<string, unknown>) => updateElementConfig(el.id, p);

  return (
    <>
      <div className="panel-head"><span>Properties</span><span>{el.type}</span></div>

      <div className="prop-group">
        <h4>{el.name}</h4>
        <Row label="Position">
          <div className="prop-pair">
            <Num value={el.x} onChange={(v) => set({ x: v })} />
            <Num value={el.y} onChange={(v) => set({ y: v })} />
          </div>
        </Row>
        <Row label="Size">
          <div className="prop-pair">
            <Num value={el.width} min={8} onChange={(v) => set({ width: v })} />
            <Num value={el.height} min={8} onChange={(v) => set({ height: v })} />
          </div>
        </Row>
        <Row label="Rotation">
          <Num value={el.rotation} min={-360} max={360} onChange={(v) => set({ rotation: v })} />
          <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>°</span>
        </Row>
        <Row label="Opacity">
          <input
            type="range" min={0} max={1} step={0.05}
            value={el.opacity}
            onChange={(e) => set({ opacity: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ width: 30, color: 'var(--text-dim)', fontSize: 10, textAlign: 'right' }}>
            {Math.round(el.opacity * 100)}%
          </span>
        </Row>
        <Row label="Layer">
          <button className="mini-btn" title="Bring to front" onClick={() => reorderElement(el.id, 'top')}><ChevronsUp size={12} /></button>
          <button className="mini-btn" title="Forward" onClick={() => reorderElement(el.id, 'up')}><ArrowUp size={12} /></button>
          <button className="mini-btn" title="Backward" onClick={() => reorderElement(el.id, 'down')}><ArrowDown size={12} /></button>
          <button className="mini-btn" title="Send to back" onClick={() => reorderElement(el.id, 'bottom')}><ChevronsDown size={12} /></button>
        </Row>
      </div>

      {el.type === 'image' && (
        <div className="prop-group">
          <h4>Image</h4>
          <Row label="Asset"><AssetSelect value={el.assetId} onChange={(v) => set({ assetId: v })} /></Row>
          <Row label="Fit">
            <select value={el.fit} onChange={(e) => set({ fit: e.target.value as any })}>
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill</option>
            </select>
          </Row>
          <Row label="Radius"><Num value={el.borderRadius} min={0} onChange={(v) => set({ borderRadius: v })} /></Row>
        </div>
      )}

      {el.type === 'text' && (
        <div className="prop-group">
          <h4>Text</h4>
          <Row label="Content">
            <textarea value={el.content} onChange={(e) => set({ content: e.target.value })} />
          </Row>
          <Row label="Font">
            <select value={el.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
              {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
            </select>
          </Row>
          <Row label="Size / Wt">
            <div className="prop-pair">
              <Num value={el.fontSize} min={4} max={200} onChange={(v) => set({ fontSize: v })} />
              <select value={el.fontWeight} onChange={(e) => set({ fontWeight: parseInt(e.target.value) })}>
                {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </Row>
          <Row label="Line ht">
            <Num value={el.lineHeight} min={0.5} max={4} step={0.05} onChange={(v) => set({ lineHeight: v })} />
          </Row>
          <Row label="Spacing">
            <Num value={el.letterSpacing} min={-10} max={50} step={0.5} onChange={(v) => set({ letterSpacing: v })} />
          </Row>
          <Row label="Color">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(el.color) ? el.color : '#000000'} onChange={(e) => set({ color: e.target.value })} />
            <input type="text" value={el.color} onChange={(e) => set({ color: e.target.value })} />
          </Row>
          <Row label="Align">
            <select value={el.textAlign} onChange={(e) => set({ textAlign: e.target.value as any })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Row>
          <Row label="Direction">
            <select value={el.direction} onChange={(e) => set({ direction: e.target.value as any })}>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL (Arabic)</option>
            </select>
          </Row>
          <Row label="BG">
            <input type="text" value={el.background} onChange={(e) => set({ background: e.target.value })} placeholder="transparent" />
          </Row>
        </div>
      )}

      {el.type === 'button' && (
        <div className="prop-group">
          <h4>Button / CTA</h4>
          <Row label="Label"><input type="text" value={el.label} onChange={(e) => set({ label: e.target.value })} /></Row>
          <Row label="Font">
            <select value={el.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
              {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0]}</option>)}
            </select>
          </Row>
          <Row label="Size / Wt">
            <div className="prop-pair">
              <Num value={el.fontSize} min={4} max={100} onChange={(v) => set({ fontSize: v })} />
              <select value={el.fontWeight} onChange={(e) => set({ fontWeight: parseInt(e.target.value) })}>
                {[300, 400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </Row>
          <Row label="Colors">
            <input type="color" title="Background" value={/^#[0-9a-f]{6}$/i.test(el.background) ? el.background : '#111111'} onChange={(e) => set({ background: e.target.value })} />
            <input type="color" title="Text" value={/^#[0-9a-f]{6}$/i.test(el.color) ? el.color : '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
          </Row>
          <Row label="Radius"><Num value={el.borderRadius} min={0} max={200} onChange={(v) => set({ borderRadius: v })} /></Row>
          <Row label="Direction">
            <select value={el.direction} onChange={(e) => set({ direction: e.target.value as any })}>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL (Arabic)</option>
            </select>
          </Row>
          <Row label="URL">
            <input type="text" value={el.url} onChange={(e) => set({ url: e.target.value })} placeholder="(uses clickTag)" />
          </Row>
        </div>
      )}

      {el.type === 'shape' && (
        <div className="prop-group">
          <h4>Shape</h4>
          <Row label="Type">
            <select value={el.shape} onChange={(e) => set({ shape: e.target.value as any })}>
              <option value="rect">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="line">Line</option>
            </select>
          </Row>
          <Row label="Fill">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(el.fill) ? el.fill : '#4f7cff'} onChange={(e) => set({ fill: e.target.value })} />
            <input type="text" value={el.fill} onChange={(e) => set({ fill: e.target.value })} />
          </Row>
          <Row label="Border">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(el.borderColor) ? el.borderColor : '#000000'} onChange={(e) => set({ borderColor: e.target.value })} />
            <Num value={el.borderWidth} min={0} max={50} onChange={(v) => set({ borderWidth: v })} />
          </Row>
          {el.shape === 'rect' && (
            <Row label="Radius"><Num value={el.borderRadius} min={0} onChange={(v) => set({ borderRadius: v })} /></Row>
          )}
        </div>
      )}

      {(el.type === 'carousel' || el.type === 'fan-carousel' || el.type === 'card-stack' || el.type === 'vertical-slider' || el.type === 'slice-flip') && (
        <>
          <SlidesEditor el={el} />
          <div className="prop-group">
            <h4>Playback</h4>
            {'autoplay' in el.config && (
              <Row label="Autoplay">
                <input type="checkbox" checked={el.config.autoplay} onChange={(e) => setCfg({ autoplay: e.target.checked })} />
              </Row>
            )}
            {'intervalMs' in el.config && (
              <Row label="Interval">
                <Num value={el.config.intervalMs} min={200} max={60000} step={100} onChange={(v) => setCfg({ intervalMs: v })} />
                <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span>
              </Row>
            )}
            {'transitionMs' in el.config && (
              <Row label="Transition">
                <Num value={el.config.transitionMs} min={50} max={10000} step={50} onChange={(v) => setCfg({ transitionMs: v })} />
                <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span>
              </Row>
            )}
            {'pauseOnHover' in el.config && (
              <Row label="Hover pause">
                <input type="checkbox" checked={el.config.pauseOnHover} onChange={(e) => setCfg({ pauseOnHover: e.target.checked })} />
              </Row>
            )}
            {el.type === 'carousel' && (
              <Row label="Style">
                <select value={el.config.variant} onChange={(e) => setCfg({ variant: e.target.value })}>
                  <option value="coverflow">Cover-flow</option>
                  <option value="stage">Stage (dimmed sides)</option>
                </select>
              </Row>
            )}
            {el.type === 'fan-carousel' && (
              <>
                <Row label="Spacing"><Num value={el.config.spacing} min={0} max={300} onChange={(v) => setCfg({ spacing: v })} /></Row>
                <Row label="Fan angle"><Num value={el.config.fanAngle} min={0} max={80} onChange={(v) => setCfg({ fanAngle: v })} /></Row>
              </>
            )}
            {el.type === 'vertical-slider' && (
              <>
                <Row label="Speed"><Num value={el.config.speed} min={0.05} max={10} step={0.1} onChange={(v) => setCfg({ speed: v })} /></Row>
                <Row label="Ping-pong">
                  <input type="checkbox" checked={el.config.pingPong} onChange={(e) => setCfg({ pingPong: e.target.checked })} />
                </Row>
              </>
            )}
            {el.type === 'slice-flip' && (
              <>
                <Row label="Slices"><Num value={el.config.sliceCount} min={2} max={20} onChange={(v) => setCfg({ sliceCount: Math.round(v) })} /></Row>
                <Row label="Flip"><Num value={el.config.flipMs} min={100} max={10000} step={50} onChange={(v) => setCfg({ flipMs: v })} />
                  <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span></Row>
                <Row label="Stagger"><Num value={el.config.staggerMs} min={0} max={2000} step={10} onChange={(v) => setCfg({ staggerMs: v })} />
                  <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span></Row>
                <Row label="Hold"><Num value={el.config.holdMs} min={200} max={60000} step={100} onChange={(v) => setCfg({ holdMs: v })} />
                  <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span></Row>
              </>
            )}
          </div>
        </>
      )}

      {el.type === 'cube' && (
        <div className="prop-group">
          <h4>Cube faces</h4>
          {['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'].map((n, i) => (
            <Row key={n} label={n}>
              <AssetSelect
                value={el.config.faces[i]}
                onChange={(v) => {
                  const faces = [...el.config.faces];
                  faces[i] = v;
                  setCfg({ faces });
                }}
              />
            </Row>
          ))}
          <Row label="Cycle">
            <Num value={el.config.durationMs} min={500} max={120000} step={500} onChange={(v) => setCfg({ durationMs: v })} />
            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>ms</span>
          </Row>
          <Row label="Face size">
            <Num value={el.config.faceSize} min={20} max={2000} onChange={(v) => setCfg({ faceSize: v })} />
          </Row>
        </div>
      )}

      {el.type === 'spotlight' && (
        <div className="prop-group">
          <h4>Spotlight</h4>
          <Row label="Intensity">
            <input
              type="range" min={0} max={1} step={0.05}
              value={el.config.intensity}
              onChange={(e) => setCfg({ intensity: parseFloat(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ width: 30, color: 'var(--text-dim)', fontSize: 10, textAlign: 'right' }}>
              {Math.round(el.config.intensity * 100)}%
            </span>
          </Row>
        </div>
      )}

      <AnimationSection el={el} />
    </>
  );
}
