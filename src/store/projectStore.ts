import { create } from 'zustand';
import type {
  AdElement,
  AssetRef,
  CreativeProject,
  SavedProjectMeta,
} from '../model/types';
import { createProject, uid } from '../model/defaults';
import { validateProject } from '../model/schema';

const LS_INDEX = 'adpilot.projects.index';
const LS_CURRENT = 'adpilot.projects.current';
const LS_PREFIX = 'adpilot.project.';
const HISTORY_LIMIT = 60;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function readIndex(): SavedProjectMeta[] {
  try {
    const raw = localStorage.getItem(LS_INDEX);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SavedProjectMeta[]) {
  try { localStorage.setItem(LS_INDEX, JSON.stringify(list)); } catch { /* quota */ }
}

/** Persist a project. Imported creatives carry multi-MB data-URL assets,
 *  so localStorage quota is a real limit — on failure, evict the oldest
 *  OTHER saved projects and retry. Returns false when nothing fits. */
function persistProject(p: CreativeProject): boolean {
  const json = JSON.stringify(p);
  const write = () => {
    localStorage.setItem(LS_PREFIX + p.id, json);
    localStorage.setItem(LS_CURRENT, p.id);
  };
  const index = () => {
    const idx = readIndex().filter((m) => m.id !== p.id);
    idx.unshift({
      id: p.id, name: p.name,
      width: p.artboard.width, height: p.artboard.height,
      updatedAt: p.updatedAt,
    });
    writeIndex(idx.slice(0, 50));
  };
  try {
    write();
    index();
    return true;
  } catch { /* quota — try evicting old projects */ }
  const victims = readIndex()
    .filter((m) => m.id !== p.id)
    .sort((a, b) => a.updatedAt - b.updatedAt); // oldest first
  for (const v of victims) {
    try { localStorage.removeItem(LS_PREFIX + v.id); } catch { /* noop */ }
    writeIndex(readIndex().filter((m) => m.id !== v.id));
    try {
      write();
      index();
      return true;
    } catch { /* keep evicting */ }
  }
  return false;
}

function loadStored(id: string): CreativeProject | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    if (!raw) return null;
    const res = validateProject(JSON.parse(raw));
    return res.ok ? res.project : null;
  } catch {
    return null;
  }
}

function initialProject(): CreativeProject {
  const cur = localStorage.getItem(LS_CURRENT);
  if (cur) {
    const p = loadStored(cur);
    if (p) return p;
  }
  return createProject('Untitled Creative', 300, 250);
}

export interface EditorState {
  project: CreativeProject;
  selectedId: string | null;
  past: CreativeProject[];
  future: CreativeProject[];
  dirty: boolean;
  lastSavedAt: number | null;
  /** localStorage quota exhausted — work continues in memory but a
   *  refresh would lose it; the toolbar surfaces this to the user */
  persistFailed: boolean;

  // transient snapshot captured at the start of a drag/resize so a
  // whole gesture produces exactly one undo step
  gestureSnapshot: CreativeProject | null;

  /* ---------- lifecycle ---------- */
  newProject: (name: string, w: number, h: number) => void;
  loadProject: (id: string) => boolean;
  replaceProject: (p: CreativeProject) => void;
  listProjects: () => SavedProjectMeta[];
  deleteProject: (id: string) => void;
  save: () => void;
  renameProject: (name: string) => void;
  setClickTag: (url: string) => void;
  setArtboard: (patch: Partial<CreativeProject['artboard']>) => void;

  /* ---------- selection ---------- */
  select: (id: string | null) => void;

  /* ---------- elements ---------- */
  addElement: (el: AdElement) => void;
  updateElement: (id: string, patch: Partial<AdElement>) => void;
  updateElementConfig: (id: string, patch: Record<string, unknown>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  reorderElement: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void;
  moveElementToIndex: (id: string, index: number) => void;

  /* ---------- assets ---------- */
  addAsset: (a: Omit<AssetRef, 'id'>) => AssetRef;
  removeAsset: (id: string) => void;

  /* ---------- history ---------- */
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useEditor = create<EditorState>((set, get) => {
  const pushHistory = (prev: CreativeProject) => {
    const { past } = get();
    set({ past: [...past.slice(-(HISTORY_LIMIT - 1)), clone(prev)], future: [] });
  };

  const touch = (project: CreativeProject): CreativeProject => {
    const p = { ...project, updatedAt: Date.now() };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = persistProject(get().project);
      set(ok
        ? { lastSavedAt: Date.now(), dirty: false, persistFailed: false }
        : { persistFailed: true });
    }, 800);
    return p;
  };

  const mutate = (fn: (p: CreativeProject) => CreativeProject, history = true) => {
    const { project, gestureSnapshot } = get();
    // while a drag/resize gesture is in progress, individual patches
    // must not create history entries — endGesture pushes one snapshot
    if (history && !gestureSnapshot) pushHistory(project);
    set({ project: touch(fn(clone(project))), dirty: true });
  };

  return {
    project: initialProject(),
    selectedId: null,
    past: [],
    future: [],
    dirty: false,
    lastSavedAt: null,
    persistFailed: false,
    gestureSnapshot: null,

    newProject: (name, w, h) => {
      persistProject(get().project);
      const p = createProject(name || 'Untitled Creative', w, h);
      const ok = persistProject(p);
      set({ project: p, selectedId: null, past: [], future: [], dirty: false, persistFailed: !ok });
    },

    loadProject: (id) => {
      const p = loadStored(id);
      if (!p) return false;
      persistProject(get().project);
      set({ project: p, selectedId: null, past: [], future: [], dirty: false });
      return true;
    },

    replaceProject: (p) => {
      const stamped = { ...p, updatedAt: Date.now() };
      const ok = persistProject(stamped);
      set({ project: stamped, selectedId: null, past: [], future: [], dirty: false, persistFailed: !ok });
    },

    listProjects: () => readIndex(),

    deleteProject: (id) => {
      try { localStorage.removeItem(LS_PREFIX + id); } catch { /* noop */ }
      writeIndex(readIndex().filter((m) => m.id !== id));
    },

    save: () => {
      const ok = persistProject(get().project);
      set(ok
        ? { lastSavedAt: Date.now(), dirty: false, persistFailed: false }
        : { persistFailed: true });
    },

    renameProject: (name) => {
      mutate((p) => ({ ...p, name: name.slice(0, 200) || p.name }));
    },

    setClickTag: (url) => mutate((p) => ({ ...p, clickTag: url })),

    setArtboard: (patch) => {
      mutate((p) => ({ ...p, artboard: { ...p.artboard, ...patch } }));
    },

    select: (id) => set({ selectedId: id }),

    addElement: (el) => {
      mutate((p) => ({ ...p, elements: [...p.elements, el] }));
      set({ selectedId: el.id });
    },

    updateElement: (id, patch) => {
      mutate((p) => ({
        ...p,
        elements: p.elements.map((e) =>
          e.id === id ? ({ ...e, ...patch } as AdElement) : e,
        ),
      }));
    },

    updateElementConfig: (id, patch) => {
      mutate((p) => ({
        ...p,
        elements: p.elements.map((e) =>
          e.id === id && 'config' in e
            ? ({ ...e, config: { ...(e as any).config, ...patch } } as AdElement)
            : e,
        ),
      }));
    },

    removeElement: (id) => {
      mutate((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
      if (get().selectedId === id) set({ selectedId: null });
    },

    duplicateElement: (id) => {
      const src = get().project.elements.find((e) => e.id === id);
      if (!src) return;
      const copy = clone(src) as AdElement;
      copy.id = uid();
      copy.name = src.name + ' copy';
      copy.x += 12;
      copy.y += 12;
      mutate((p) => {
        const i = p.elements.findIndex((e) => e.id === id);
        const elements = [...p.elements];
        elements.splice(i + 1, 0, copy);
        return { ...p, elements };
      });
      set({ selectedId: copy.id });
    },

    reorderElement: (id, dir) => {
      mutate((p) => {
        const elements = [...p.elements];
        const i = elements.findIndex((e) => e.id === id);
        if (i < 0) return p;
        const [el] = elements.splice(i, 1);
        const to =
          dir === 'up' ? Math.min(elements.length, i + 1)
          : dir === 'down' ? Math.max(0, i - 1)
          : dir === 'top' ? elements.length : 0;
        elements.splice(to, 0, el);
        return { ...p, elements };
      });
    },

    moveElementToIndex: (id, index) => {
      mutate((p) => {
        const elements = [...p.elements];
        const i = elements.findIndex((e) => e.id === id);
        if (i < 0) return p;
        const [el] = elements.splice(i, 1);
        elements.splice(Math.max(0, Math.min(elements.length, index)), 0, el);
        return { ...p, elements };
      });
    },

    addAsset: (a) => {
      const asset: AssetRef = { ...a, id: uid('as') };
      mutate((p) => ({ ...p, assets: [...p.assets, asset] }));
      return asset;
    },

    removeAsset: (id) => {
      mutate((p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== id),
        elements: p.elements.map((e) =>
          e.type === 'image' && e.assetId === id ? { ...e, assetId: undefined } : e,
        ),
      }));
    },

    undo: () => {
      const { past, future, project } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({
        project: touch(prev),
        past: past.slice(0, -1),
        future: [...future, clone(project)],
        dirty: true,
      });
    },

    redo: () => {
      const { past, future, project } = get();
      if (!future.length) return;
      const next = future[future.length - 1];
      set({
        project: touch(next),
        past: [...past, clone(project)],
        future: future.slice(0, -1),
        dirty: true,
      });
    },

    beginGesture: () => {
      set({ gestureSnapshot: clone(get().project) });
    },

    endGesture: () => {
      const { gestureSnapshot, project } = get();
      if (!gestureSnapshot) return;
      // skip empty history entries (plain clicks with no movement)
      if (JSON.stringify(gestureSnapshot) === JSON.stringify(project)) {
        set({ gestureSnapshot: null });
        return;
      }
      set({
        past: [...get().past.slice(-(HISTORY_LIMIT - 1)), gestureSnapshot],
        future: [],
        gestureSnapshot: null,
      });
    },
  };
});

/** Convenience selector for the currently selected element. */
export function useSelectedElement(): AdElement | null {
  return useEditor((s) =>
    s.selectedId ? s.project.elements.find((e) => e.id === s.selectedId) ?? null : null,
  );
}
