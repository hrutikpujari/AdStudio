import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { useEditor } from '../store/projectStore';
import { timelineDuration } from '../render/animations';

interface Props {
  playheadMs: number | null;      // current position while previewing
  onPlay: () => void;             // open preview + play from start
  onRestart: () => void;
  onScrub: (ms: number) => void;  // seek: open paused preview at ms
}

/**
 * Timeline — one track per animated element, blocks laid out by
 * delay/duration, ruler in seconds, click/drag to scrub.
 */
export function TimelinePanel({ playheadMs, onPlay, onRestart, onScrub }: Props) {
  const elements = useEditor((s) => s.project.elements);
  const select = useEditor((s) => s.select);
  const selectedId = useEditor((s) => s.selectedId);
  const tracksRef = useRef<HTMLDivElement>(null);

  const animated = elements.filter((e) => e.animation.preset !== 'none');
  const duration = useMemo(() => timelineDuration(elements), [elements]);
  const pxPerMs = 0.16; // 160px per second
  const trackWidth = Math.max(600, duration * pxPerMs + 40);

  const ticks = useMemo(() => {
    const step = duration <= 3000 ? 500 : duration <= 8000 ? 1000 : 2000;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return out;
  }, [duration]);

  const scrubFromEvent = (e: ReactPointerEvent) => {
    const el = tracksRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left + el.scrollLeft, trackWidth));
    onScrub(Math.round(x / pxPerMs));
  };

  const onTrackPointerDown = (e: ReactPointerEvent) => {
    scrubFromEvent(e);
    const move = (ev: globalThis.PointerEvent) => {
      const el = tracksRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(ev.clientX - r.left + el.scrollLeft, trackWidth));
      onScrub(Math.round(x / pxPerMs));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const headX = playheadMs != null ? Math.min(playheadMs, duration) * pxPerMs : null;

  return (
    <div className="timeline">
      <div className="tl-head">
        <span className="tl-title">Animation Timeline</span>
        <button className="mini-btn accent" onClick={onPlay} title="Play preview">
          <Play size={11} style={{ verticalAlign: -1 }} /> Play
        </button>
        <button className="mini-btn" onClick={onRestart} title="Restart from beginning">
          <RotateCcw size={11} style={{ verticalAlign: -1 }} /> Restart
        </button>
        <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>
          {(duration / 1000).toFixed(1)}s
          {playheadMs != null && ` · ${(Math.min(playheadMs, duration) / 1000).toFixed(2)}s`}
        </span>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <div style={{ height: 18 }} />
          {animated.map((el) => (
            <div
              key={el.id}
              className="tl-label"
              style={{
                cursor: 'pointer',
                color: el.id === selectedId ? 'var(--accent)' : undefined,
              }}
              onClick={() => select(el.id)}
              title={el.name}
            >
              {el.name}
            </div>
          ))}
        </div>
        <div className="tl-tracks" ref={tracksRef} onPointerDown={onTrackPointerDown}>
          <div className="tl-ruler" style={{ width: trackWidth }}>
            {ticks.map((t) => (
              <span key={t} className="tl-tick" style={{ left: t * pxPerMs }}>
                {(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}s
              </span>
            ))}
          </div>
          {animated.map((el) => {
            const a = el.animation;
            const iter = a.iterations === 'infinite' ? 1 : a.iterations;
            return (
              <div key={el.id} className="tl-track" style={{ width: trackWidth }}>
                <div
                  className="tl-block"
                  style={{
                    left: a.delay * pxPerMs,
                    width: Math.max(6, a.duration * iter * pxPerMs),
                  }}
                  title={`${a.preset} · ${a.delay}ms + ${a.duration}ms ×${iter}`}
                  onClick={() => select(el.id)}
                />
              </div>
            );
          })}
          {headX != null && <div className="tl-playhead" style={{ left: headX }} />}
          {animated.length === 0 && (
            <div className="tl-empty">
              No animations yet — select an element and choose a preset in the Animation section.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
