import { useState } from 'react';
import type { DragEvent } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Lock,
  Move3d,
  Rows3,
  Square,
  Trash2,
  Type,
  GalleryHorizontal,
  Sun,
  MousePointerClick,
  Unlock,
  Box,
} from 'lucide-react';
import type { ElementType } from '../model/types';
import { useEditor } from '../store/projectStore';

const TYPE_ICON: Record<ElementType, React.ReactNode> = {
  image: <ImageIcon size={12} />,
  text: <Type size={12} />,
  button: <MousePointerClick size={12} />,
  shape: <Square size={12} />,
  carousel: <GalleryHorizontal size={12} />,
  'card-stack': <Layers size={12} />,
  'fan-carousel': <Rows3 size={12} />,
  cube: <Move3d size={12} />,
  'vertical-slider': <Box size={12} />,
  spotlight: <Sun size={12} />,
};

export function LayersPanel() {
  const elements = useEditor((s) => s.project.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const updateElement = useEditor((s) => s.updateElement);
  const removeElement = useEditor((s) => s.removeElement);
  const duplicateElement = useEditor((s) => s.duplicateElement);
  const moveElementToIndex = useEditor((s) => s.moveElementToIndex);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // topmost element (end of array) shown first
  const rows = [...elements].reverse();

  const commitRename = (id: string) => {
    if (editName.trim()) updateElement(id, { name: editName.trim() });
    setEditingId(null);
  };

  const onDropRow = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const dragId = e.dataTransfer.getData('application/x-adpilot-layer');
    if (!dragId || dragId === targetId) return;
    // dropping on a row inserts the dragged element at that row's z position
    const targetIndex = elements.findIndex((x) => x.id === targetId);
    if (targetIndex < 0) return;
    moveElementToIndex(dragId, targetIndex + 1);
  };

  return (
    <div className="panel-section grow" style={{ minHeight: 80 }}>
      <div className="panel-head"><span>Layers</span><span>{elements.length}</span></div>
      <div className="layers-list">
        {rows.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 11, padding: '8px 6px' }}>
            No elements yet.
          </div>
        )}
        {rows.map((el) => (
          <div
            key={el.id}
            className={
              'layer-row' +
              (el.id === selectedId ? ' selected' : '') +
              (dragOverId === el.id ? ' drag-over' : '')
            }
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-adpilot-layer', el.id)}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(el.id); }}
            onDragLeave={() => setDragOverId((d) => (d === el.id ? null : d))}
            onDrop={(e) => onDropRow(e, el.id)}
            onClick={() => select(el.id)}
            onDoubleClick={() => { setEditingId(el.id); setEditName(el.name); }}
          >
            <span className="type-ic">{TYPE_ICON[el.type]}</span>
            {editingId === el.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => commitRename(el.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(el.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ flex: 1, padding: '1px 4px', fontSize: 11 }}
              />
            ) : (
              <span className="lname" style={{ opacity: el.visible ? 1 : 0.45 }}>
                {el.name}
              </span>
            )}
            <button
              className={'icon-btn' + (el.locked ? ' always' : '')}
              title={el.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => { e.stopPropagation(); updateElement(el.id, { locked: !el.locked }); }}
            >
              {el.locked ? <Lock size={11} /> : <Unlock size={11} />}
            </button>
            <button
              className={'icon-btn' + (!el.visible ? ' always' : '')}
              title={el.visible ? 'Hide' : 'Show'}
              onClick={(e) => { e.stopPropagation(); updateElement(el.id, { visible: !el.visible }); }}
            >
              {el.visible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
            <button
              className="icon-btn"
              title="Duplicate"
              onClick={(e) => { e.stopPropagation(); duplicateElement(el.id); }}
            >
              <Copy size={11} />
            </button>
            <button
              className="icon-btn"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
