import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FilePlus2,
  FolderOpen,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import { AD_SIZES } from '../model/types';
import { useEditor } from '../store/projectStore';
import { useUi } from '../store/uiStore';

interface Props {
  zoom: number;
  onZoom: (z: number | 'fit') => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onPreview: () => void;
  onStopPreview: () => void;
  onRestart: () => void;
  previewOpen: boolean;
  onValidate: () => void;
  onExport: () => void;
  onAi: () => void;
}

export function TopToolbar({
  zoom, onZoom, onNewProject, onOpenProject, onPreview, onStopPreview,
  onRestart, previewOpen, onValidate, onExport, onAi,
}: Props) {
  const project = useEditor((s) => s.project);
  const renameProject = useEditor((s) => s.renameProject);
  const setArtboard = useEditor((s) => s.setArtboard);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const save = useEditor((s) => s.save);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const dirty = useEditor((s) => s.dirty);
  const lastSavedAt = useEditor((s) => s.lastSavedAt);
  const persistFailed = useEditor((s) => s.persistFailed);
  const toast = useUi((s) => s.toast);

  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.id]); // eslint-disable-line

  const sizeVal = `${project.artboard.width}x${project.artboard.height}`;
  const isPreset = AD_SIZES.some((s) => `${s.w}x${s.h}` === sizeVal);

  return (
    <div className="toolbar">
      <div className="tb-title">
        <span className="logo-dot">AP</span>
        <span className="tb-title-text">AdPilot Studio</span>
      </div>

      <input
        className="tb-project-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => renameProject(name)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        title="Project name"
      />

      <div className="tb-sep" />

      <button className="tb-btn" onClick={onNewProject} title="New project">
        <FilePlus2 size={14} /> New
      </button>
      <button className="tb-btn" onClick={onOpenProject} title="Open saved project">
        <FolderOpen size={14} /> Open
      </button>
      <button
        className="tb-btn"
        onClick={() => { save(); toast('Project saved', 'ok'); }}
        title="Save project (Ctrl+S)"
      >
        <Save size={14} /> Save{dirty ? ' •' : ''}
      </button>

      <div className="tb-sep" />

      <button className="tb-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        <Undo2 size={14} />
      </button>
      <button className="tb-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">
        <Redo2 size={14} />
      </button>

      <div className="tb-sep" />

      <button
        className={`tb-btn ${previewOpen ? 'active' : ''}`}
        onClick={previewOpen ? onStopPreview : onPreview}
        title={previewOpen ? 'Stop preview' : 'Play preview'}
      >
        {previewOpen ? <Square size={14} /> : <Play size={14} />}
        {previewOpen ? 'Stop' : 'Preview'}
      </button>
      <button className="tb-btn" onClick={onRestart} title="Restart animation">
        <RotateCcw size={14} />
      </button>

      <div className="tb-sep" />

      <div className="tb-size">
        <button className="tb-btn" onClick={() => onZoom(Math.max(0.25, zoom - 0.25))} title="Zoom out"><ZoomOut size={14} /></button>
        <button className="tb-btn" onClick={() => onZoom('fit')} title="Fit to workspace"><Maximize size={14} /></button>
        <button className="tb-btn" onClick={() => onZoom(Math.min(4, zoom + 0.25))} title="Zoom in"><ZoomIn size={14} /></button>
        <select
          value={isPreset ? sizeVal : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') return;
            const [w, h] = e.target.value.split('x').map(Number);
            setArtboard({ width: w, height: h });
          }}
          title="Ad size"
        >
          {AD_SIZES.map((s) => (
            <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>{s.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="tb-sep" />

      <button className="tb-btn" onClick={onAi} title="Generate creative from a prompt">
        <Wand2 size={14} /> AI
      </button>
      <button className="tb-btn" onClick={onValidate} title="Validate creative">
        <CheckCircle2 size={14} /> Validate
      </button>
      <button className="tb-btn primary" onClick={onExport} title="Export HTML5 ZIP">
        <Download size={14} /> Export
      </button>

      <div className="tb-status" style={persistFailed ? { color: 'var(--danger, #ff7a7a)' } : undefined}>
        {persistFailed
          ? 'storage full — export ZIP to keep changes'
          : lastSavedAt
            ? `saved ${new Date(lastSavedAt).toLocaleTimeString()}`
            : 'autosave on'}
      </div>
    </div>
  );
}
