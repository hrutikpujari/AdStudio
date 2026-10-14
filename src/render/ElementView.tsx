import type {
  AdElement,
  AssetRef,
  CarouselElement,
  CardStackElement,
  CubeElement,
  FanElement,
  SliceFlipElement,
  SlideConfig,
  SpotlightElement,
  VerticalSliderElement,
} from '../model/types';
import type { CSSProperties } from 'react';

/**
 * Static canvas rendering of an element (editing state — final position).
 * Live animation runs in the preview iframe, which renders the exported HTML.
 */

function SlideThumb({ slide, assets, accent, fit = 'cover' }: { slide: SlideConfig; assets: AssetRef[]; accent: string; fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down' }) {
  const src = slide.assetId ? assets.find((a) => a.id === slide.assetId)?.src : '';
  if (src) {
    return <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />;
  }
  return (
    <div className="ce-ph" style={{ borderColor: accent, color: accent }}>
      <span>{slide.title}</span>
      {slide.subtitle ? <small>{slide.subtitle}</small> : null}
    </div>
  );
}

function CarouselView({ el, assets }: { el: CarouselElement; assets: AssetRef[] }) {
  const slides = el.config.slides;
  const c = el.config;
  const stage = c.variant === 'stage';
  const sw = c.slideWPct ?? 70;
  const sh = c.slideHPct ?? 86;
  const sx = c.sideXPct ?? (stage ? 110 : 75);
  const ss = c.sideScale ?? (stage ? 0.4 : 0.8);
  const side = (idx: number, dir: -1 | 1) =>
    slides[idx] && (
      <div style={{
        position: 'absolute', top: '50%', left: '50%', width: `${sw}%`, height: `${sh}%`,
        transform: `translate(calc(-50% ${dir > 0 ? '+' : '-'} ${sx}%), -50%) scale(${ss})`,
        opacity: 0.5, filter: stage ? 'brightness(.45) saturate(.5)' : undefined, zIndex: 2,
      }}>
        <SlideThumb slide={slides[idx]} assets={assets} accent="#b3e0ff" fit={c.slideFit} />
      </div>
    );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {slides.length > 2 ? side(1, 1) : null}
      {slides.length > 1 ? side(slides.length - 1, -1) : null}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', width: `${sw}%`, height: `${sh}%`,
        transform: 'translate(-50%, -50%)', zIndex: 3, boxShadow: '0 2px 10px rgba(0,0,0,.18)',
      }}>
        {slides[0] ? <SlideThumb slide={slides[0]} assets={assets} accent="#b3e0ff" fit={c.slideFit} /> : null}
      </div>
    </div>
  );
}

function CardStackView({ el, assets }: { el: CardStackElement; assets: AssetRef[] }) {
  const wScale = [1, 0.9045, 0.809, 0.7134];
  const xFrac = [0, 0.2962, 0.5923, 0.8885];
  const yFrac = [0, 0.0411, 0.0823, 0.1234];
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {el.config.slides.slice(0, 4).map((s, i) => (
        <div key={s.id} style={{
          position: 'absolute', left: 0, top: 0,
          width: el.width * 0.5923 * wScale[i], height: el.height * 0.862 * wScale[i],
          transform: `translate(${el.width * xFrac[i]}px, ${el.height * yFrac[i]}px)`,
          zIndex: 4 - i, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.2)', overflow: 'hidden',
        }}>
          <SlideThumb slide={s} assets={assets} accent="#d4e8ff" />
        </div>
      ))}
    </div>
  );
}

function FanView({ el, assets }: { el: FanElement; assets: AssetRef[] }) {
  const c = el.config;
  const cardW = Math.min(el.width * 0.5, 150);
  const cardH = el.height * 0.9;
  const show = c.slides.slice(0, Math.min(5, c.slides.length));
  const mid = Math.floor(show.length / 2);
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 1000 }}>
      {show.map((s, i) => {
        const off = i - mid;
        const ao = Math.abs(off);
        return (
          <div key={s.id} style={{
            position: 'absolute', left: '50%', top: '50%',
            width: cardW, height: cardH, marginLeft: -cardW / 2, marginTop: -cardH / 2,
            transform: `translateX(${off * c.spacing}px) rotateY(${off * -c.fanAngle}deg) scale(${Math.max(0.45, 1 - ao * 0.18)})`,
            transformStyle: 'preserve-3d', backfaceVisibility: 'hidden',
            opacity: Math.max(0, 1 - ao * 0.3), zIndex: 10 - ao,
            background: '#fff', borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(0,0,0,.25)',
          }}>
            <SlideThumb slide={s} assets={assets} accent="#ffcccc" />
          </div>
        );
      })}
    </div>
  );
}

function CubeView({ el, assets }: { el: CubeElement; assets: AssetRef[] }) {
  const s = el.config.faceSize;
  const front = el.config.faces[0] ? assets.find((a) => a.id === el.config.faces[0])?.src : '';
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: s, height: s, position: 'relative', transform: 'rotateY(-24deg) rotateX(12deg)', transformStyle: 'preserve-3d',
      }}>
        <div style={{
          position: 'absolute', inset: 0, transform: `translateZ(${s / 2}px)`,
          background: '#1a1a2e', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 8px rgba(0,0,0,.3)',
        }}>
          {front
            ? <img src={front} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" draggable={false} />
            : <div className="ce-ph" style={{ border: 'none', color: '#ffd54f', background: 'transparent' }}><span>FACE 1</span></div>}
        </div>
        <div style={{
          position: 'absolute', inset: 0, transform: `rotateY(90deg) translateZ(${s / 2}px)`,
          background: '#252540', borderRadius: 8, opacity: 0.9,
        }} />
        <div style={{
          position: 'absolute', inset: 0, transform: `rotateX(90deg) translateZ(${s / 2}px)`,
          background: '#2e2e4d', borderRadius: 8, opacity: 0.9,
        }} />
      </div>
    </div>
  );
}

function VerticalSliderView({ el, assets }: { el: VerticalSliderElement; assets: AssetRef[] }) {
  const show = el.config.slides.slice(0, 4);
  const slideH = el.height / Math.min(show.length || 1, 4) ;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {show.map((s, i) => {
        const src = s.assetId ? assets.find((a) => a.id === s.assetId)?.src : '';
        return (
          <div key={s.id} style={{
            height: Math.min(slideH, 60), display: 'flex', flexDirection: 'row-reverse',
            alignItems: 'center', background: '#fff', borderBottom: '1px solid #e0e0e0',
          }}>
            <div style={{ padding: '5px 8px', flex: 1, fontFamily: 'Arial' }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: '#0088cc' }}>{s.title}</div>
              <div style={{ display: 'flex', gap: 5, fontWeight: 700, fontSize: 11, marginTop: 4 }}>
                <span style={{ color: '#0088cc' }}>{s.price}</span>
                <span style={{ color: '#99cce6', textDecoration: 'line-through' }}>{s.oldPrice}</span>
              </div>
            </div>
            {src
              ? <img src={src} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} alt="" draggable={false} />
              : <div style={{ width: 40, height: 40, border: '2px dashed #b3e0ff', borderRadius: 6, margin: '0 6px 0 0' }} />}
          </div>
        );
      })}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,.06))' }} />
    </div>
  );
}

function SliceFlipView({ el, assets }: { el: SliceFlipElement; assets: AssetRef[] }) {
  const c = el.config;
  const first = c.slides[0];
  const src = first?.assetId ? assets.find((a) => a.id === first.assetId)?.src : '';
  const N = Math.max(2, Math.min(20, Math.round(c.sliceCount) || 8));
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#fff' }}>
      {src
        ? <img src={src} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} alt="" draggable={false} />
        : <div className="ce-ph"><span>SLICE FLIP</span><small>{c.slides.length} slides</small></div>}
      {Array.from({ length: N - 1 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${((i + 1) / N) * 100}%`, width: 1,
          background: 'rgba(255,255,255,.7)', boxShadow: '0 0 0 .5px rgba(0,0,0,.08)',
        }} />
      ))}
    </div>
  );
}

function SpotlightView({ el }: { el: SpotlightElement }) {
  const k = el.config.intensity;
  const f = (a: number) => +(a * k).toFixed(2);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(120% 80% at 50% 60%, rgba(0,0,0,0) 30%, rgba(0,0,0,${f(0.18)}) 70%, rgba(0,0,0,${f(0.32)}) 100%)`,
      }} />
      <div style={{
        position: 'absolute', top: 0, left: '50%', width: '73%', height: '70%',
        transform: 'translateX(-50%)', clipPath: 'polygon(46% 0%, 54% 0%, 90% 100%, 10% 100%)',
        background: `linear-gradient(to bottom, rgba(255,255,240,${f(0.85)}) 0%, rgba(255,255,235,${f(0.35)}) 45%, rgba(255,255,235,${f(0.05)}) 100%)`,
        filter: 'blur(6px)',
      }} />
      <div style={{
        position: 'absolute', bottom: '8%', left: '50%', width: '70%', height: '31%',
        transform: 'translateX(-50%)', borderRadius: '50%', filter: 'blur(6px)',
        background: `radial-gradient(closest-side, rgba(255,255,240,${f(0.55)}) 0%, rgba(255,255,240,${f(0.28)}) 45%, rgba(255,255,240,0) 100%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '50%', width: '63%', height: '28%',
        transform: 'translateX(-50%)', borderRadius: '50%', filter: 'blur(1.2px)',
        border: `1.5px solid rgba(255,255,240,${f(0.8)})`,
        boxShadow: `0 0 12px rgba(255,255,240,${f(0.6)}), inset 0 0 14px rgba(255,255,240,${f(0.4)})`,
      }} />
    </div>
  );
}

export function ElementView({ el, assets }: { el: AdElement; assets: AssetRef[] }) {
  const inner: CSSProperties = { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' };

  switch (el.type) {
    case 'image': {
      const src = el.assetId ? assets.find((a) => a.id === el.assetId)?.src : '';
      return (
        <div style={inner}>
          {src
            ? <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: el.fit, borderRadius: el.borderRadius, display: 'block' }} />
            : <div className="ce-ph" style={{ borderRadius: el.borderRadius }}><span>IMAGE</span><small>drop or assign asset</small></div>}
        </div>
      );
    }
    case 'text':
      return (
        <div style={{
          ...inner,
          display: 'flex', alignItems: 'center',
          fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight,
          lineHeight: el.lineHeight, letterSpacing: el.letterSpacing, color: el.color,
          textAlign: el.textAlign, direction: el.direction,
          justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
          background: el.background !== 'transparent' ? el.background : undefined,
          overflow: 'hidden',
        }}>
          {el.content}
        </div>
      );
    case 'button':
      return (
        <div style={inner}>
          <div style={{
            width: '100%', height: '100%', border: 'none', cursor: 'pointer',
            background: el.background, color: el.color, borderRadius: el.borderRadius,
            fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight,
            direction: el.direction, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {el.label}
          </div>
        </div>
      );
    case 'shape':
      return (
        <div style={inner}>
          <div style={{
            width: '100%', height: '100%', background: el.fill,
            borderRadius: el.shape === 'ellipse' ? '50%' : el.borderRadius,
            border: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor}` : undefined,
            boxSizing: 'border-box',
          }} />
        </div>
      );
    case 'carousel': return <div style={inner}><CarouselView el={el} assets={assets} /></div>;
    case 'card-stack': return <div style={inner}><CardStackView el={el} assets={assets} /></div>;
    case 'fan-carousel': return <div style={inner}><FanView el={el} assets={assets} /></div>;
    case 'cube': return <div style={inner}><CubeView el={el} assets={assets} /></div>;
    case 'vertical-slider': return <div style={inner}><VerticalSliderView el={el} assets={assets} /></div>;
    case 'slice-flip': return <div style={inner}><SliceFlipView el={el} assets={assets} /></div>;
    case 'spotlight': return <div style={inner}><SpotlightView el={el} /></div>;
  }
}
