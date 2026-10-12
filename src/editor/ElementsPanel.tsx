import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  Box,
  Image as ImageIcon,
  Layers,
  Move3d,
  Rows3,
  Square,
  Type,
  GalleryHorizontal,
  Sun,
  MousePointerClick,
  Upload,
  X,
} from 'lucide-react';
import type { ElementType } from '../model/types';
import { createElement } from '../model/defaults';
import { useEditor } from '../store/projectStore';

const BASIC: { type: ElementType; label: string; icon: React.ReactNode }[] = [
  { type: 'image', label: 'Image', icon: <ImageIcon size={18} /> },
  { type: 'text', label: 'Text', icon: <Type size={18} /> },
  { type: 'button', label: 'Button / CTA', icon: <MousePointerClick size={18} /> },
  { type: 'shape', label: 'Shape', icon: <Square size={18} /> },
];

const ADVANCED: { type: ElementType; label: string; icon: React.ReactNode }[] = [
  { type: 'carousel', label: 'Carousel', icon: <GalleryHorizontal size={18} /> },
  { type: 'card-stack', label: 'Card Stack', icon: <Layers size={18} /> },
  { type: 'fan-carousel', label: 'Fan Slider', icon: <Rows3 size={18} /> },
  { type: 'cube', label: '3D Cube', icon: <Move3d size={18} /> },
  { type: 'vertical-slider', label: 'Vertical Feed', icon: <Box size={18} /> },
  { type: 'spotlight', label: 'Spotlight', icon: <Sun size={18} /> },
];

const MAX_ASSET_BYTES = 2.5 * 1024 * 1024; // keep zips light
const OK_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

export function ElementsPanel() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const addElement = useEditor((s) => s.addElement);
  const updateElement = useEditor((s) => s.updateElement);
  const addAsset = useEditor((s) => s.addAsset);
  const removeAsset = useEditor((s) => s.removeAsset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [uploadErr, setUploadErr] = useState('');

  const add = (type: ElementType) =>
    addElement(createElement(type, project.artboard.width, project.artboard.height));

  const onDragStart = (e: DragEvent, type: ElementType) => {
    e.dataTransfer.setData('application/x-adpilot-element', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setUploadErr('');
    Array.from(files).forEach((f) => {
      if (!OK_TYPES.includes(f.type)) {
        setUploadErr(`"${f.name}" is not a supported image type`);
        return;
      }
      if (f.size > MAX_ASSET_BYTES) {
        setUploadErr(`"${f.name}" exceeds 2.5 MB`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          addAsset({
            name: f.name,
            kind: 'image',
            mimeType: f.type,
            src: String(reader.result),
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(f);
    });
  };

  const assignAsset = (assetId: string) => {
    const sel = project.elements.find((e) => e.id === selectedId);
    if (sel?.type === 'image') {
      updateElement(sel.id, { assetId } as any);
    } else {
      const el = createElement('image', project.artboard.width, project.artboard.height) as any;
      el.assetId = assetId;
      el.name = project.assets.find((a) => a.id === assetId)?.name ?? 'Image';
      addElement(el);
    }
  };

  const q = query.trim().toLowerCase();
  const filt = (l: { label: string }) => !q || l.label.toLowerCase().includes(q);

  return (
    <>
      <div className="panel-section">
        <div className="panel-head"><span>Elements</span></div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <input
            className="el-search"
            placeholder="Search elements…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="el-cat">Basic</div>
          <div className="el-grid">
            {BASIC.filter(filt).map((b) => (
              <div
                key={b.type}
                className="el-chip"
                draggable
                onDragStart={(e) => onDragStart(e, b.type)}
                onClick={() => add(b.type)}
                title={`Add ${b.label} — drag onto canvas or click`}
              >
                {b.icon}
                {b.label}
              </div>
            ))}
          </div>
          <div className="el-cat">Advanced</div>
          <div className="el-grid">
            {ADVANCED.filter(filt).map((b) => (
              <div
                key={b.type}
                className="el-chip"
                draggable
                onDragStart={(e) => onDragStart(e, b.type)}
                onClick={() => add(b.type)}
                title={`Add ${b.label} — drag onto canvas or click`}
              >
                {b.icon}
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-section grow">
        <div className="panel-head"><span>Assets</span><span>{project.assets.length}</span></div>
        <div className="panel-body" style={{ flex: 1 }}>
          <div className="asset-grid">
            {project.assets.map((a) => (
              <div
                key={a.id}
                className="asset-thumb"
                title={`${a.name} — click to use`}
                onClick={() => assignAsset(a.id)}
              >
                <img src={a.src} alt={a.name} />
                <button
                  className="del"
                  onClick={(e) => { e.stopPropagation(); removeAsset(a.id); }}
                  title="Remove asset"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          <div className="asset-upload" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Upload images
          </div>
          {uploadErr && <div style={{ color: 'var(--danger)', fontSize: 10.5, marginTop: 5 }}>{uploadErr}</div>}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            multiple
            hidden
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>
    </>
  );
}
