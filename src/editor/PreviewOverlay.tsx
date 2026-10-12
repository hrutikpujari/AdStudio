import { useMemo } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { CreativeProject } from '../model/types';
import { generateHtml } from '../export/generateHtml';

interface Props {
  project: CreativeProject;
  /** null → live playback; number → paused frame at that time (scrub) */
  scrubMs: number | null;
  /** bump to force the iframe to reload = restart animation */
  nonce: number;
  onRestart: () => void;
  onClose: () => void;
}

/**
 * Preview runs the SAME generated HTML that the ZIP exporter produces,
 * inside a sandboxed iframe (scripts allowed for ad runtimes, popups
 * allowed for clickTag testing, no same-origin access).
 */
export function PreviewOverlay({ project, scrubMs, nonce, onRestart, onClose }: Props) {
  const srcDoc = useMemo(() => {
    const assets = new Map(project.assets.map((a) => [a.id, a.src]));
    return generateHtml(project, (id) => (id ? assets.get(id) ?? '' : ''), {
      scrubMs: scrubMs ?? undefined,
    });
  }, [project, scrubMs, nonce]);

  const { width, height } = project.artboard;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>
            Preview — {project.name}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: 8 }}>
              {width}×{height}
              {scrubMs != null && ` · paused at ${(scrubMs / 1000).toFixed(2)}s`}
            </span>
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="mini-btn" onClick={onRestart} title="Restart animation">
              <RotateCcw size={12} style={{ verticalAlign: -1 }} /> Restart
            </button>
            <button className="mini-btn" onClick={onClose}><X size={12} /></button>
          </div>
        </div>
        <div className="preview-stage">
          <iframe
            key={`${nonce}-${scrubMs ?? 'live'}`}
            className="preview-frame"
            title="Creative preview"
            width={width}
            height={height}
            sandbox="allow-scripts allow-popups"
            srcDoc={srcDoc}
          />
        </div>
      </div>
    </div>
  );
}
