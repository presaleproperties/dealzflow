// Global "Start New Chat" launcher state.
// Any surface in the app can open the new-chat dialog by calling
// `useNewChatStore.getState().open()` (or pre-seeding a contact id).
import { create } from 'zustand';

interface NewChatState {
  isOpen: boolean;
  /** Optional contact id to pre-select when opening (e.g. from a lead row). */
  presetContactId: string | null;
  /** Optional default channel ('text' | 'email'). */
  presetChannel: 'text' | 'email' | null;

  open: (opts?: { contactId?: string | null; channel?: 'text' | 'email' | null }) => void;
  close: () => void;
}

export const useNewChatStore = create<NewChatState>((set) => ({
  isOpen: false,
  presetContactId: null,
  presetChannel: null,
  open: (opts) =>
    set({
      isOpen: true,
      presetContactId: opts?.contactId ?? null,
      presetChannel: opts?.channel ?? null,
    }),
  close: () => set({ isOpen: false, presetContactId: null, presetChannel: null }),
}));
