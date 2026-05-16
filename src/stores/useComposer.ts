/**
 * Tier 4 — UnifiedComposer global store.
 *
 * One source of truth for the right-slide-over composer. All entry points
 * call `openComposer({...})`. There is exactly one composer mounted at the
 * app root (see <ComposerMount /> in App.tsx → NativeBootstrap).
 *
 * The composer itself reads from this store; entry points only push state
 * into it. This collapses the 5 legacy compose surfaces into 1.
 */
import { create } from 'zustand';

export type ComposerChannel = 'email' | 'text';
export type ComposerMode = 'new' | 'reply' | 'replyAll' | 'forward';
export type RecipientMode = 'single' | 'segment' | 'custom';

export interface ComposerOpenArgs {
  channel?: ComposerChannel;
  mode?: ComposerMode;
  leadId?: string | null;
  threadId?: string | null;
  /** Pre-fill subject (email only). */
  subject?: string;
  /** Pre-fill body. Plain text for SMS, HTML for email. */
  body?: string;
  /** Reply context — e.g. inbox reply prefills To from thread. */
  toEmail?: string;
  toPhone?: string;
  toName?: string;
}

interface ComposerState {
  open: boolean;
  channel: ComposerChannel;
  mode: ComposerMode;
  leadId: string | null;
  threadId: string | null;
  initialSubject: string;
  initialBody: string;
  initialToEmail: string;
  initialToPhone: string;
  initialToName: string;
  /** Bumped each time openComposer is called so the composer remounts state. */
  instance: number;

  openComposer: (args?: ComposerOpenArgs) => void;
  closeComposer: () => void;
}

export const useComposerStore = create<ComposerState>((set, get) => ({
  open: false,
  channel: 'email',
  mode: 'new',
  leadId: null,
  threadId: null,
  initialSubject: '',
  initialBody: '',
  initialToEmail: '',
  initialToPhone: '',
  initialToName: '',
  instance: 0,

  openComposer: (args = {}) => {
    set({
      open: true,
      channel: args.channel ?? 'email',
      mode: args.mode ?? 'new',
      leadId: args.leadId ?? null,
      threadId: args.threadId ?? null,
      initialSubject: args.subject ?? '',
      initialBody: args.body ?? '',
      initialToEmail: args.toEmail ?? '',
      initialToPhone: args.toPhone ?? '',
      initialToName: args.toName ?? '',
      instance: get().instance + 1,
    });
  },

  closeComposer: () => set({ open: false }),
}));

/** Imperative helper for non-React callers. */
export function openComposer(args?: ComposerOpenArgs) {
  useComposerStore.getState().openComposer(args);
}
