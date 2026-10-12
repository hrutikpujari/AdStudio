import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import type { CreativeProject } from '../model/types';
import { TopToolbar } from './TopToolbar';
import { ElementsPanel } from './ElementsPanel';
import { LayersPanel } from './LayersPanel';
import { Artboard } from './Artboard';
import { PropertiesPanel } from './PropertiesPanel';
import { TimelinePanel } from './TimelinePanel';
import { PreviewOverlay } from './PreviewOverlay';
import { NewProjectDialog } from './NewProjectDialog';
import { AiPanel } from './AiPanel';
import { validateForExport, type ValidationIssue } from '../export/validate';
import { buildCreativeZip, downloadBlob } from '../export/exportZip';
import { CheckCircle2, X } from 'lucide-react';

export function EditorLayout() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const save = useEditor((s) => s.save);
  const removeElement = useEditor((s) => s.removeElement);
  const duplicateElement = useEditor((s) => s.duplicateElement);
  const updateElement = useEditor((s) => s.updateElement);
  const replaceProject = useEditor((s) => s.replaceProject);
  const toast = useUi((s) => s.toast);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const [dialog, setDialog] = useState<'new' | 'open' | 'ai' | 'validate' | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [aiPreview, setAiPreview] = useState<CreativeProject | null>(null);
  const [exporting, setExporting] = useState(false);
  const playStartRef = useRef(0);

  /* -------- fit zoom -------- */
  const fitZoom = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const zx = (r.width - 80) / project.artboard.width;
    const zy = (r.height - 80) / project.artboard.height;
    setZoom(Math.max(0.1, Math.min(3, Math.min(zx, zy))));
  }, [project.artboard.width, project.artboard.height]);

  useEffect(() => {
    fitZoom();
    const ro = new ResizeObserver(fitZoom);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [fitZoom]);

  const onZoom = useCallback((z: number | 'fit') => {
    if (z === 'fit') fitZoom();
    else setZoom(z);
  }, [fitZoom]);

  /* -------- preview / timeline -------- */
  const openPreview = useCallback((scrub: number | null = null) => {
    setScrubMs(scrub);
    setPreviewNonce((n) => n + 1);
    setPreviewOpen(true);
    playStartRef.current = performance.now();
    if (scrub == null) setPlayheadMs(0);
    else setPlayheadMs(scrub);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPlayheadMs(null);
    setScrubMs(null);
  }, []);

  const restartPreview = useCallback(() => {
    setScrubMs(null);
    setPreviewNonce((n) => n + 1);
    playStartRef.current = performance.now();
    setPlayheadMs(0);
  }, []);

  // rAF-driven playhead while preview is open & playing
  useEffect(() => {
    if (!previewOpen || scrubMs != null) return;
    let raf = 0;
    const tick = (t: number) => {
      setPlayheadMs(t - playStartRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewOpen, scrubMs, previewNonce]);

  /* -------- export / validate -------- */
  const runValidate = useCallback(() => {
    setIssues(validateForExport(project));
    setDialog('validate');
  }, [project]);

  const runExport = useCallback(async () => {
    if (exporting) return;
    const found = validateForExport(project);
    const errors = found.filter((i) => i.level === 'error');
    if (errors.length) {
      setIssues(found);
      setDialog('validate');
      toast(`${errors.length} validation error(s) — fix before export`, 'err');
      return;
    }
    setExporting(true);
    try {
      const blob = await buildCreativeZip(project);
      const safe = project.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'creative';
      downloadBlob(blob, `${safe}_${project.artboard.width}x${project.artboard.height}.zip`);
      if (found.some((i) => i.level === 'warning')) {
        toast('Exported with warnings — check Validate for details', 'info');
      } else {
        toast('HTML5 creative exported', 'ok');
      }
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'err');
    } finally {
      setExporting(false);
    }
  }, [project, exporting, toast]);

  /* -------- keyboard shortcuts -------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        toast('Project saved', 'ok');
        return;
      }
      if (inField) return;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selectedId) duplicateElement(selectedId);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const el = project.elements.find((x) => x.id === selectedId);
        if (el && !el.locked) removeElement(selectedId);
        return;
      }
      if (e.key.startsWith('Arrow') && selectedId) {
        const el = project.elements.find((x) => x.id === selectedId);
        if (!el || el.locked) return;
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        updateElement(el.id, { x: el.x + dx, y: el.y + dy });
        return;
      }
      if (e.key === 'Escape') {
        if (previewOpen) closePreview();
        else setDialog(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, project.elements, undo, redo, save, removeElement, duplicateElement, updateElement, previewOpen, closePreview, toast]);

  return (
    <div className="editor">
      <TopToolbar
        zoom={zoom}
        onZoom={onZoom}
        onNewProject={() => setDialog('new')}
        onOpenProject={() => setDialog('open')}
        onPreview={() => openPreview()}
        onStopPreview={closePreview}
        onRestart={() => (previewOpen ? restartPreview() : openPreview())}
        previewOpen={previewOpen}
        onValidate={runValidate}
        onExport={runExport}
        onAi={() => setDialog('ai')}
      />

      <div className="panel-left">
        <ElementsPanel />
        <LayersPanel />
      </div>

      <div className="canvas-area" ref={canvasRef}>
        <Artboard zoom={zoom} />
        <div className="zoom-bar">
          <button onClick={() => onZoom(Math.max(0.1, zoomRef.current - 0.25))}>−</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={() => onZoom(Math.min(4, zoomRef.current + 0.25))}>+</button>
          <button onClick={() => onZoom('fit')}>fit</button>
        </div>
      </div>

      <div className="panel-right">
        <PropertiesPanel />
      </div>

      <div className="timeline-area">
        <TimelinePanel
          playheadMs={previewOpen ? playheadMs : null}
          onPlay={() => openPreview()}
          onRestart={() => (previewOpen ? restartPreview() : openPreview())}
          onScrub={(ms) => openPreview(ms)}
        />
      </div>

      {(dialog === 'new' || dialog === 'open') && (
        <NewProjectDialog mode={dialog} onClose={() => setDialog(null)} />
      )}
      {dialog === 'ai' && (
        <AiPanel
          onClose={() => setDialog(null)}
          onPreviewGenerated={(p) => { setAiPreview(p); setDialog(null); }}
        />
      )}
      {dialog === 'validate' && (
        <div className="overlay" onClick={() => setDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head">
              <h3><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Validation</h3>
              <button className="mini-btn" onClick={() => setDialog(null)}><X size={12} /></button>
            </div>
            <div className="dialog-body">
              {issues.length === 0 && (
                <div className="val-item ok">No issues found — creative is ready to export.</div>
              )}
              {issues.map((i, idx) => (
                <div key={idx} className={`val-item ${i.level}`}>
                  {i.level === 'error' ? '✕' : '⚠'} {i.message}
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 10 }}>
                Note: platform-specific requirements (DV360 weight limits, MRAID, SSL asset
                hosting) are not fully covered — see README for manual checks.
              </div>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <PreviewOverlay
          project={aiPreview ?? project}
          scrubMs={scrubMs}
          nonce={previewNonce}
          onRestart={restartPreview}
          onClose={() => { closePreview(); setAiPreview(null); }}
        />
      )}
      {aiPreview && !previewOpen && (
        <div className="overlay" onClick={() => setAiPreview(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head"><h3>Apply AI-generated creative?</h3></div>
            <div className="dialog-foot">
              <button className="mini-btn" onClick={() => setAiPreview(null)}>Reject</button>
              <button className="mini-btn" onClick={() => openPreview()}>Preview again</button>
              <button
                className="mini-btn accent"
                onClick={() => { replaceProject(aiPreview); setAiPreview(null); toast('AI creative applied', 'ok'); }}
              >
                Apply to project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
