import { useState } from 'react';
import type { DragEvent } from 'react';
import {
  Box,
  Film,
  Image as ImageIcon,
  Layers,
  Columns3,
  Move3d,
  Rows3,
  Square,
  Type,
  GalleryHorizontal,
  Sun,
  MousePointerClick,
} from 'lucide-react';
import type { ElementType } from '../model/types';
import { createElement } from '../model/defaults';
import { useEditor } from '../store/projectStore';

const BASIC: { type: ElementType; label: string; icon: React.ReactNode }[] = [
  { type: 'image', label: 'Image', icon: <ImageIcon size={18} /> },
  { type: 'video', label: 'Video', icon: <Film size={18} /> },
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
  { type: 'slice-flip', label: 'Slice Flip', icon: <Columns3 size={18} /> },
  { type: 'spotlight', label: 'Spotlight', icon: <Sun size={18} /> },
];

export function ElementsPanel() {
  const project = useEditor((s) => s.project);
  const addElement = useEditor((s) => s.addElement);
  const [query, setQuery] = useState('');

  const add = (type: ElementType) =>
    addElement(createElement(type, project.artboard.width, project.artboard.height));

  const onDragStart = (e: DragEvent, type: ElementType) => {
    e.dataTransfer.setData('application/x-adpilot-element', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const q = query.trim().toLowerCase();
  const filt = (l: { label: string }) => !q || l.label.toLowerCase().includes(q);

  return (
    <div className="panel-section grow">
      <div className="panel-head"><span>Elements</span></div>
      <div className="panel-body" style={{ flex: 1, paddingTop: 0 }}>
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
  );
}
