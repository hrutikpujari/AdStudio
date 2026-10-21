import { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  familiesInFontCss,
  familyStack,
} from '../fonts/fonts';
import { useEditor } from '../store/projectStore';

/**
 * Searchable font picker. Groups: fonts already available in the
 * project (imported @font-face + uploaded files + chosen Google fonts),
 * the Google Fonts catalogue, and system fallbacks. Choosing a Google
 * font registers it on the project so editor and export both load it.
 */
export function FontPicker({ value, onChange }: { value: string; onChange: (cssFamily: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const project = useEditor((s) => s.project);
  const addGoogleFont = useEditor((s) => s.addGoogleFont);

  const current = value.split(',')[0].replace(/['"]/g, '').trim() || 'Arial';

  const projectFonts = useMemo(() => {
    const set = new Set<string>();
    familiesInFontCss(project.fontCss).forEach((f) => set.add(f));
    project.assets.filter((a) => a.kind === 'font').forEach((a) => set.add(a.name.replace(/\.(woff2?|ttf|otf|eot)$/i, '')));
    (project.googleFonts ?? []).forEach((f) => set.add(f));
    return [...set];
  }, [project.fontCss, project.assets, project.googleFonts]);

  const needle = q.trim().toLowerCase();
  const googleList = GOOGLE_FONTS.filter((g) => !needle || g.f.toLowerCase().includes(needle));
  const projList = projectFonts.filter((f) => !needle || f.toLowerCase().includes(needle));
  const sysList = SYSTEM_FONTS.filter((f) => !needle || f.toLowerCase().includes(needle));

  const pick = (family: string, isGoogle: boolean) => {
    if (isGoogle) addGoogleFont(family);
    onChange(familyStack(family));
    setOpen(false);
    setQ('');
  };

  return (
    <div className="fpick" ref={wrapRef} onBlur={(e) => {
      if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
    }}>
      <button type="button" className="fpick-btn" onClick={() => setOpen((o) => !o)}>
        <span style={{ fontFamily: value }}>{current}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="fpick-pop">
          <input
            autoFocus
            className="fpick-search"
            placeholder="Search fonts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="fpick-list">
            {projList.length > 0 && <div className="fpick-head">In this project</div>}
            {projList.map((f) => (
              <button key={`p${f}`} type="button" className="fpick-item" style={{ fontFamily: `'${f}', sans-serif` }} onClick={() => pick(f, false)}>{f}</button>
            ))}
            {googleList.length > 0 && <div className="fpick-head">Google Fonts</div>}
            {googleList.map((g) => (
              <button key={g.f} type="button" className="fpick-item" onClick={() => pick(g.f, true)}>
                <span>{g.f}</span>
                {g.ar && <span className="fpick-tag">عربي</span>}
              </button>
            ))}
            {sysList.length > 0 && <div className="fpick-head">Built-in</div>}
            {sysList.map((f) => (
              <button key={f} type="button" className="fpick-item" style={{ fontFamily: f }} onClick={() => { onChange(f); setOpen(false); setQ(''); }}>
                {f.split(',')[0]}
              </button>
            ))}
            {!projList.length && !googleList.length && !sysList.length && (
              <div className="fpick-head">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
