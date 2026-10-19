import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { createElement } from '../model/defaults';
import { useEditor } from '../store/projectStore';

const MAX_ASSET_BYTES = 2.5 * 1024 * 1024; // keep zips light
const OK_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

export function AssetsPanel() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const addElement = useEditor((s) => s.addElement);
  const updateElement = useEditor((s) => s.updateElement);
  const addAsset = useEditor((s) => s.addAsset);
  const removeAsset = useEditor((s) => s.removeAsset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadErr, setUploadErr] = useState('');

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

  return (
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
  );
}
