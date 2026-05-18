import { create } from 'zustand';

type State = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

/**
 * Lightweight ephemeral state for the global Zara command bar (⌘K).
 * Not persisted — the bar should always open fresh.
 */
export const useZaraCommandBar = create<State>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
