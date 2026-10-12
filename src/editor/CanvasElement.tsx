import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AdElement, AssetRef } from '../model/types';
import { useEditor } from '../store/projectStore';
import { ElementView } from '../render/ElementView';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: { id: Handle; x: string; y: string }[] = [
  { id: 'nw', x: '0%', y: '0%' }, { id: 'n', x: '50%', y: '0%' },
  { id: 'ne', x: '100%', y: '0%' }, { id: 'e', x: '100%', y: '50%' },
  { id: 'se', x: '100%', y: '100%' }, { id: 's', x: '50%', y: '100%' },
  { id: 'sw', x: '0%', y: '100%' }, { id: 'w', x: '0%', y: '50%' },
];

interface Props {
  el: AdElement;
  assets: AssetRef[];
  zoom: number;
  artW: number;
  artH: number;
  selected: boolean;
}

/**
 * Renders one element on the artboard. Selection & drag-to-move are
 * handled by Artboard (geometry-based, so overlapping elements don't
 * steal events). This component owns the resize handles.
 */
export function CanvasElement({ el, assets, zoom, selected }: Props) {
  const select = useEditor((s) => s.select);
  const updateElement = useEditor((s) => s.updateElement);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);

  const onHandleDown = (e: ReactPointerEvent, handle: Handle) => {
    if (e.button !== 0 || el.locked) return;
    e.stopPropagation();
    select(el.id);
    beginGesture();
    const startX = e.clientX;
    const startY = e.clientY;
    const o = { x: el.x, y: el.y, w: el.width, h: el.height };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const MIN = 8;

    const move = (ev: globalThis.PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let { x, y, w, h } = o;
      if (handle.includes('e')) w = o.w + dx;
      if (handle.includes('s')) h = o.h + dy;
      if (handle.includes('w')) { w = o.w - dx; x = o.x + dx; }
      if (handle.includes('n')) { h = o.h - dy; y = o.y + dy; }
      if (w < MIN) { if (handle.includes('w')) x = o.x + o.w - MIN; w = MIN; }
      if (h < MIN) { if (handle.includes('n')) y = o.y + o.h - MIN; h = MIN; }
      updateElement(el.id, {
        x: Math.round(x), y: Math.round(y),
        width: Math.round(w), height: Math.round(h),
      });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      endGesture();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  return (
    <div
      className={
        'ce' +
        (selected ? ' selected' : '') +
        (el.locked ? ' locked' : ' selectable') +
        (el.visible ? '' : ' hidden-el')
      }
      style={{
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        opacity: el.opacity,
      }}
      data-elid={el.id}
    >
      <div className="ce-inner">
        <ElementView el={el} assets={assets} />
      </div>
      {selected && !el.locked &&
        HANDLES.map((h) => (
          <div
            key={h.id}
            className={`rh ${h.id}`}
            style={{ left: h.x, top: h.y }}
            onPointerDown={(e) => onHandleDown(e, h.id)}
          />
        ))}
    </div>
  );
}
