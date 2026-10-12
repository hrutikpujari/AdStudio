import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { AD_SIZES } from '../model/types';
import { TEMPLATES } from '../model/defaults';
import { useEditor } from '../store/projectStore';
import { useUi } from '../store/uiStore';

interface Props {
  mode: 'new' | 'open';
  onClose: () => void;
}

export function NewProjectDialog({ mode, onClose }: Props) {
  const newProject = useEditor((s) => s.newProject);
  const replaceProject = useEditor((s) => s.replaceProject);
  const loadProject = useEditor((s) => s.loadProject);
  const listProjects = useEditor((s) => s.listProjects);
  const deleteProject = useEditor((s) => s.deleteProject);
  const toast = useUi((s) => s.toast);

  const [name, setName] = useState('Untitled Creative');
  const [sel, setSel] = useState('300x250');
  const [custom, setCustom] = useState(false);
  const [cw, setCw] = useState(300);
  const [ch, setCh] = useState(250);
  const [tpl, setTpl] = useState<string | null>(null);
  const [saved, setSaved] = useState(listProjects());

  const create = () => {
    if (tpl) {
      const t = TEMPLATES.find((x) => x.id === tpl);
      if (t) {
        const p = t.build();
        p.name = name || t.label;
        replaceProject(p);
        toast(`Created "${p.name}" from template`, 'ok');
        onClose();
        return;
      }
    }
    const [w, h] = custom ? [cw, ch] : sel.split('x').map(Number);
    newProject(name, w, h);
    toast(`Created ${w}×${h} project`, 'ok');
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>{mode === 'new' ? 'New project' : 'Open project'}</h3>
          <button className="mini-btn" onClick={onClose}><X size={12} /></button>
        </div>
        <div className="dialog-body">
          {mode === 'open' ? (
            saved.length === 0 ? (
              <div style={{ color: 'var(--text-faint)', padding: 16, textAlign: 'center' }}>
                No saved projects yet.
              </div>
            ) : (
              saved.map((m) => (
                <div key={m.id} className="slide-row" style={{ marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12 }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {m.width}×{m.height} · {new Date(m.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="mini-btn accent"
                    onClick={() => {
                      if (loadProject(m.id)) { toast(`Opened "${m.name}"`, 'ok'); onClose(); }
                      else toast('Could not open project — saved data is corrupted', 'err');
                    }}
                  >
                    Open
                  </button>
                  <button
                    className="mini-btn danger"
                    onClick={() => { deleteProject(m.id); setSaved(listProjects()); }}
                    title="Delete saved project"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )
          ) : (
            <>
              <div className="field">
                <label>Project name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>Start from a template</label>
                <div className="tpl-grid">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      className={`tpl-card ${tpl === t.id ? 'sel' : ''}`}
                      style={tpl === t.id ? { borderColor: 'var(--accent)' } : undefined}
                      onClick={() => setTpl(tpl === t.id ? null : t.id)}
                    >
                      <b>{t.label}</b>
                      <span>{t.width}×{t.height} — {t.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              {!tpl && (
                <div className="field">
                  <label>Artboard size</label>
                  <div className="size-grid">
                    {AD_SIZES.map((s) => (
                      <button
                        key={`${s.w}x${s.h}`}
                        className={`size-opt ${!custom && sel === `${s.w}x${s.h}` ? 'sel' : ''}`}
                        onClick={() => { setCustom(false); setSel(`${s.w}x${s.h}`); }}
                      >
                        <b>{s.w} × {s.h}</b>
                        <span>{s.label.split('—')[1]?.trim() ?? ''}</span>
                      </button>
                    ))}
                    <button
                      className={`size-opt ${custom ? 'sel' : ''}`}
                      onClick={() => setCustom(true)}
                    >
                      <b>Custom</b>
                      <span>Enter your own dimensions</span>
                    </button>
                  </div>
                  {custom && (
                    <div className="prop-row" style={{ marginTop: 8 }}>
                      <label>W / H</label>
                      <div className="prop-pair">
                        <input type="number" value={cw} min={10} max={3000} onChange={(e) => setCw(+e.target.value)} />
                        <input type="number" value={ch} min={10} max={3000} onChange={(e) => setCh(+e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {mode === 'new' && (
          <div className="dialog-foot">
            <button className="mini-btn" onClick={onClose}>Cancel</button>
            <button className="mini-btn accent" onClick={create}>Create project</button>
          </div>
        )}
      </div>
    </div>
  );
}
