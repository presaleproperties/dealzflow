import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ZaraDockState = {
  open: boolean;
  conversationId: string | null;
  showHistory: boolean;
  pendingMessage: string | null; // message queued from a chip click before the input has it
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setConversationId: (id: string | null) => void;
  setShowHistory: (v: boolean) => void;
  setPendingMessage: (text: string | null) => void;
};

/**
 * Persistent state for the floating ZaraDock.
 * - open / conversationId survive page navigations and reloads.
 * - showHistory + pendingMessage are session-local UI state.
 */
export const useZaraDock = create<ZaraDockState>()(
  persist(
    (set, get) => ({
      open: false,
      conversationId: null,
      showHistory: false,
      pendingMessage: null,
      setOpen: (open) => set({ open }),
      toggle: () => set({ open: !get().open }),
      setConversationId: (conversationId) => set({ conversationId }),
      setShowHistory: (showHistory) => set({ showHistory }),
      setPendingMessage: (pendingMessage) => set({ pendingMessage }),
    }),
    {
      name: 'zara_dock',
      // Only persist long-lived bits.
      partialize: (s) => ({ open: s.open, conversationId: s.conversationId }),
    },
  ),
);
