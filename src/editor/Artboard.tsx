import { useCallback, useEffect, useRef } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ElementType } from '../model/types';
import { createElement, createImageFromAsset } from '../model/defaults';
import { useEditor } from '../store/projectStore';
import { CanvasElement } from './CanvasElement';
import { ASSET_DRAG_TYPE } from './AssetsPanel';

/**
 * Artboard: centered, zoomable canvas. All pointer interaction
 * (select / move / click-through on overlaps) is handled here so
 * geometry — not DOM hit-testing — decides which element wins.
 */
export function Artboard({ zoom }: { zoom: number }) {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const addElement = useEditor((s) => s.addElement);
  const updateElement = useEditor((s) => s.updateElement);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const boardRef = useRef<HTMLDivElement>(null);

  const { width: AW, height: AH } = project.artboard;

  const toArtboard = useCallback(
    (clientX: number, clientY: number) => {
      const r = boardRef.current!.getBoundingClientRect();
      return {
        x: (clientX - r.left) / zoom,
        y: (clientY - r.top) / zoom,
      };
    },
    [zoom],
  );

  /** Elements under an artboard point, topmost first. */
  const hitsAt = useCallback(
    (px: number, py: number) => {
      const els = project.elements;
      const hits: string[] = [];
      for (let i = els.length - 1; i >= 0; i--) {
        const e = els[i];
        if (!e.visible) continue;
        if (px >= e.x && px <= e.x + e.width && py >= e.y && py <= e.y + e.height) {
          hits.push(e.id);
        }
      }
      return hits;
    },
    [project.elements],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const p = toArtboard(e.clientX, e.clientY);
    const hits = hitsAt(p.x, p.y);

    if (!hits.length) {
      select(null);
      return;
    }
    // Always act on the topmost element. The click-through cycle only
    // applies on a clean click — see `up` below — so a press on an
    // already-selected element starts a drag, not a re-selection of
    // whatever sits under it.
    const target = hits[0];
    const wasSelected = target === selectedId;
    const el = project.elements.find((x) => x.id === target)!;
    if (!wasSelected) select(target);
    if (el.locked) {
      if (wasSelected && hits.length > 1) select(hits[1 % hits.length]);
      return;
    }

    // drag-to-move, driven from the artboard so overlapping elements
    // can't steal the gesture
    beginGesture();
    const startX = p.x;
    const startY = p.y;
    const origX = el.x;
    const origY = el.y;
    let moved = false;
    const move = (ev: globalThis.PointerEvent) => {
      const cur = toArtboard(ev.clientX, ev.clientY);
      const dx = cur.x - startX;
      const dy = cur.y - startY;
      // <3px of screen movement is a sloppy click, not a drag —
      // don't nudge the element and keep the cycle-on-release alive
      if (!moved && Math.hypot(dx * zoom, dy * zoom) < 3) return;
      moved = true;
      const nx = Math.min(Math.max(origX + dx, -el.width * 0.25), AW - el.width * 0.25);
      const ny = Math.min(Math.max(origY + dy, -el.height * 0.25), AH - el.height * 0.25);
      updateElement(el.id, { x: Math.round(nx), y: Math.round(ny) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
      // clean click on an already-selected element → cycle selection
      // to the element beneath it
      if (!moved && wasSelected && hits.length > 1) select(hits[1 % hits.length]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const p = toArtboard(e.clientX, e.clientY);

    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (assetId) {
      const asset = project.assets.find((a) => a.id === assetId);
      if (!asset) return;
      // dropped onto an image → swap its picture; anywhere else → new image
      const hit = hitsAt(p.x, p.y)
        .map((id) => project.elements.find((x) => x.id === id)!)
        .find((x) => x.type === 'image' && !x.locked);
      if (hit) {
        updateElement(hit.id, { assetId } as any);
        select(hit.id);
      } else {
        addElement(createImageFromAsset(asset, AW, AH, p));
      }
      return;
    }

    const type = e.dataTransfer.getData('application/x-adpilot-element') as ElementType;
    if (!type) return;
    const el = createElement(type, AW, AH, { x: Math.round(p.x), y: Math.round(p.y) });
    // keep the new element inside the artboard
    el.x = Math.max(0, Math.min(el.x, AW - el.width));
    el.y = Math.max(0, Math.min(el.y, AH - el.height));
    addElement(el);
  };

  // fit zoom is computed by parent; scroll-into-view on mount
  useEffect(() => {
    boardRef.current?.scrollIntoView({ block: 'center', inline: 'center' });
  }, []);

  const bgImg = project.artboard.backgroundImageAssetId
    ? project.assets.find((a) => a.id === project.artboard.backgroundImageAssetId)?.src
    : undefined;

  return (
    <div
      className="artboard-wrap"
      onPointerDown={onPointerDown}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
    >
      <div
        ref={boardRef}
        className="artboard"
        style={{
          width: AW,
          height: AH,
          transform: `scale(${zoom})`,
          background: project.artboard.backgroundColor,
          ...(bgImg
            ? {
                backgroundImage: `url(${bgImg})`,
                backgroundSize: project.artboard.backgroundFit === 'fill' ? '100% 100%' : project.artboard.backgroundFit,
                backgroundRepeat: 'no-repeat',
              }
            : {}),
        }}
      >
        <div className="artboard-inner">
          {project.elements.length === 0 && (
            <div className="canvas-empty">
              <b>Empty artboard</b>
              Drag elements from the left panel, or click one to add it.
              <br />Use Preview to play the creative at any time.
            </div>
          )}
          {project.elements.map((el) => (
            <CanvasElement
              key={el.id}
              el={el}
              assets={project.assets}
              zoom={zoom}
              artW={AW}
              artH={AH}
              selected={el.id === selectedId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
