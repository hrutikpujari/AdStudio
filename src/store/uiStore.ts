import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  text: string;
}

interface UiState {
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  toast: (text, kind = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
