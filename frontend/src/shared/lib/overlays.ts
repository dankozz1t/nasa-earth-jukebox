// One panel at a time. Keys, buttons inside other panels and the header can all open the same panels
// without importing each other's components.

import { create } from "zustand";

type Overlay = "access" | "shortcuts" | "tune";

export const useOverlay = create<{
  open: Overlay | null;
  show(name: Overlay): void;
  hide(name: Overlay): void; // only when `name` is the open one
}>()((set, get) => ({
  open: null,
  show: (name) => set({ open: name }),
  hide: (name) => {
    if (get().open === name) set({ open: null });
  },
}));
