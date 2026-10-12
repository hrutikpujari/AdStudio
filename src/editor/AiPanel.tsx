import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { CreativeProject } from '../model/types';
import { generateFromPrompt } from '../ai/mockAi';
import { useEditor } from '../store/projectStore';
import { useUi } from '../store/uiStore';

interface Props {
  onClose: () => void;
  onPreviewGenerated: (p: CreativeProject) => void;
}

/**
 * AI prompt → validated creative config. The generated JSON is previewed
 * and must be explicitly accepted before it replaces the open project.
 */
export function AiPanel({ onClose, onPreviewGenerated }: Props) {
  const project = useEditor((s) => s.project);
  const replaceProject = useEditor((s) => s.replaceProject);
  const toast = useUi((s) => s.toast);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ project: CreativeProject; summary: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setErrors([]);
    setResult(null);
    try {
      const res = await generateFromPrompt(prompt, project);
      if (res.ok && res.project) {
        setResult({ project: res.project, summary: res.summary ?? '' });
      } else {
        setErrors(res.errors ?? ['Generation failed']);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3><Sparkles size={14} style={{ verticalAlign: -2 }} /> Generate creative with AI</h3>
          <button className="mini-btn" onClick={onClose}><X size={12} /></button>
        </div>
        <div className="dialog-body">
          <div className="field">
            <label>Describe the creative</label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={'e.g. "300x250 retail sale banner, red background, logo top right, three-image carousel in the center, Arabic CTA at the bottom, fade in then slide transition"'}
              autoFocus
            />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 10 }}>
            Runs against a mock generator for now — see README for connecting a real model API.
            Output is schema-validated and never executes generated code.
          </div>
          {errors.map((e, i) => (
            <div key={i} className="val-item error">{e}</div>
          ))}
          {result && (
            <>
              <div className="val-item ok">{result.summary}</div>
              <div className="ai-diff">
                {JSON.stringify(
                  {
                    name: result.project.name,
                    size: `${result.project.artboard.width}x${result.project.artboard.height}`,
                    elements: result.project.elements.map((e) => ({
                      name: e.name, type: e.type,
                      animation: e.animation.preset !== 'none' ? e.animation : undefined,
                    })),
                  },
                  null, 2,
                )}
              </div>
            </>
          )}
        </div>
        <div className="dialog-foot">
          <button className="mini-btn" onClick={onClose}>Cancel</button>
          {result ? (
            <>
              <button
                className="mini-btn"
                onClick={() => onPreviewGenerated(result.project)}
              >
                Preview
              </button>
              <button
                className="mini-btn accent"
                onClick={() => {
                  replaceProject(result.project);
                  toast('AI creative applied to project', 'ok');
                  onClose();
                }}
              >
                Apply to project
              </button>
            </>
          ) : (
            <button className="mini-btn accent" disabled={!prompt.trim() || busy} onClick={generate}>
              {busy ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
