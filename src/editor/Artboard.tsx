import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AdElement, ElementType } from '../model/types';
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
  // guide lines currently shown while dragging (artboard coords)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

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

    // full-bleed elements are the background — they must never be
    // reached by cycling, only by a direct click on an uncovered area
    const isBackground = (cand: AdElement) => {
      const ix = Math.max(0, Math.min(cand.x + cand.width, AW) - Math.max(cand.x, 0));
      const iy = Math.max(0, Math.min(cand.y + cand.height, AH) - Math.max(cand.y, 0));
      return ix * iy >= AW * AH * 0.85;
    };
    // clean click on an already-selected element → cycle to the next
    // non-background element beneath it (or stay put)
    const cycleBelow = () => {
      for (let k = 1; k < hits.length; k++) {
        const cand = hits[(hits.indexOf(target) + k) % hits.length];
        const candEl = project.elements.find((x) => x.id === cand)!;
        if (!isBackground(candEl)) { select(cand); return; }
      }
    };

    if (!wasSelected) select(target);
    if (el.locked) {
      if (wasSelected) cycleBelow();
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
    // snap targets: artboard edges/center + every other visible
    // element's left/center/right (top/middle/bottom) edges
    const xs: number[] = [0, AW / 2, AW];
    const ys: number[] = [0, AH / 2, AH];
    for (const o of project.elements) {
      if (o.id === el.id || !o.visible) continue;
      xs.push(o.x, o.x + o.width / 2, o.x + o.width);
      ys.push(o.y, o.y + o.height / 2, o.y + o.height);
    }
    const SNAP = 5 / zoom; // 5 screen px regardless of zoom level
    /** snap `pos` so an anchor (left/center/right edge) lands on a target */
    const snapAxis = (pos: number, size: number, targets: number[]) => {
      let best: number | null = null;
      for (const off of [0, size / 2, size]) {
        for (const t of targets) {
          const d = t - (pos + off);
          if (Math.abs(d) <= SNAP && (best === null || Math.abs(d) < Math.abs(best))) best = d;
        }
      }
      return { pos: pos + (best ?? 0), hit: best !== null };
    };
    const move = (ev: globalThis.PointerEvent) => {
      const cur = toArtboard(ev.clientX, ev.clientY);
      const dx = cur.x - startX;
      const dy = cur.y - startY;
      // <3px of screen movement is a sloppy click, not a drag —
      // don't nudge the element and keep the cycle-on-release alive
      if (!moved && Math.hypot(dx * zoom, dy * zoom) < 3) return;
      moved = true;
      let nx = Math.min(Math.max(origX + dx, -el.width * 0.25), AW - el.width * 0.25);
      let ny = Math.min(Math.max(origY + dy, -el.height * 0.25), AH - el.height * 0.25);
      const sx = snapAxis(nx, el.width, xs);
      const sy = snapAxis(ny, el.height, ys);
      nx = sx.pos;
      ny = sy.pos;
      // a guide line shows for each target the element snapped onto
      const gv = sx.hit ? xs.filter((t) => [0, el.width / 2, el.width].some((o) => Math.abs(nx + o - t) < 0.5)) : [];
      const gh = sy.hit ? ys.filter((t) => [0, el.height / 2, el.height].some((o) => Math.abs(ny + o - t) < 0.5)) : [];
      setGuides({ v: [...new Set(gv)], h: [...new Set(gh)] });
      updateElement(el.id, { x: Math.round(nx), y: Math.round(ny) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides({ v: [], h: [] });
      endGesture();
      if (!moved && wasSelected) cycleBelow();
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

  // arrow-key nudge: 1px, Shift = 10px. A burst of nudges becomes one
  // undo step by keeping a gesture open until the keys go quiet.
  useEffect(() => {
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let gestureOpen = false;
    const endQuiet = () => {
      if (gestureOpen) { useEditor.getState().endGesture(); gestureOpen = false; }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      const { selectedId, project, updateElement, beginGesture } = useEditor.getState();
      const el = selectedId ? project.elements.find((x) => x.id === selectedId) : null;
      if (!el || el.locked || !el.visible) return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      if (!gestureOpen) { beginGesture(); gestureOpen = true; }
      updateElement(el.id, { x: el.x + dx, y: el.y + dy });
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(endQuiet, 600);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (quietTimer) clearTimeout(quietTimer);
      endQuiet();
    };
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
          {guides.v.map((x) => (
            <div key={`v${x}`} className="snap-guide v" style={{ left: x, width: 1 / zoom }} />
          ))}
          {guides.h.map((y) => (
            <div key={`h${y}`} className="snap-guide h" style={{ top: y, height: 1 / zoom }} />
          ))}
        </div>
      </div>
    </div>
  );
}
