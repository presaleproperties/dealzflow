import { useEffect, useRef, useState } from 'react';

export type EmailDraft = {
  subject: string;
  bodyHtml: string;
  cc?: string;
  bcc?: string;
  updatedAt: number;
};

const KEY_PREFIX = 'crm:email-draft:v1:';
const CHANNEL_NAME = 'crm:email-draft:v1';

const storageKey = (scope: string) => `${KEY_PREFIX}${scope}`;

// Per-tab id so we can ignore echoes of our own writes
const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

type BroadcastMsg =
  | { type: 'update'; scope: string; draft: EmailDraft; from: string }
  | { type: 'clear'; scope: string; from: string };

let sharedChannel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!sharedChannel) {
    try {
      sharedChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      sharedChannel = null;
    }
  }
  return sharedChannel;
}

export function loadEmailDraft(scope: string): EmailDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmailDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearEmailDraft(scope: string) {
  try {
    localStorage.removeItem(storageKey(scope));
    getChannel()?.postMessage({ type: 'clear', scope, from: TAB_ID } as BroadcastMsg);
  } catch {
    /* ignore */
  }
}

/**
 * Lightweight localStorage-backed autosave for email composers.
 * - Debounced 600ms
 * - Skips empty drafts
 * - Tracks `savedAt` for UI hints ("Saved · just now")
 * - Cross-tab sync: when another tab writes to the same scope, `onRemoteUpdate`
 *   fires with the latest draft so the open composer can live-merge changes.
 *
 * Pass `enabled=false` (e.g. dialog closed) to pause writes.
 */
export function useEmailDraftAutosave(
  scope: string,
  draft: Omit<EmailDraft, 'updatedAt'>,
  enabled: boolean,
  onRemoteUpdate?: (draft: EmailDraft) => void,
) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenAt = useRef<number>(0);
  const remoteCb = useRef(onRemoteUpdate);
  remoteCb.current = onRemoteUpdate;

  // Local autosave (debounced)
  useEffect(() => {
    if (!enabled) return;
    const stripped = (draft.bodyHtml || '').replace(/<[^>]*>/g, '').trim();
    const hasContent = !!(draft.subject?.trim() || stripped);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (!hasContent) {
          localStorage.removeItem(storageKey(scope));
          getChannel()?.postMessage({ type: 'clear', scope, from: TAB_ID } as BroadcastMsg);
          return;
        }
        const payload: EmailDraft = { ...draft, updatedAt: Date.now() };
        localStorage.setItem(storageKey(scope), JSON.stringify(payload));
        lastWrittenAt.current = payload.updatedAt;
        setSavedAt(payload.updatedAt);
        getChannel()?.postMessage({ type: 'update', scope, draft: payload, from: TAB_ID } as BroadcastMsg);
      } catch {
        /* quota or serialization error — ignore */
      }
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scope, enabled, draft.subject, draft.bodyHtml, draft.cc, draft.bcc]);

  // Cross-tab sync: BroadcastChannel (same-origin) + storage event (fallback)
  useEffect(() => {
    if (!enabled) return;

    const applyRemote = (incoming: EmailDraft) => {
      // Ignore older or same-as-last-write payloads
      if (!incoming || typeof incoming.updatedAt !== 'number') return;
      if (incoming.updatedAt <= lastWrittenAt.current) return;
      lastWrittenAt.current = incoming.updatedAt;
      setSavedAt(incoming.updatedAt);
      remoteCb.current?.(incoming);
    };

    const channel = getChannel();
    const onMessage = (e: MessageEvent<BroadcastMsg>) => {
      const msg = e.data;
      if (!msg || msg.scope !== scope || msg.from === TAB_ID) return;
      if (msg.type === 'update') applyRemote(msg.draft);
      else if (msg.type === 'clear') {
        lastWrittenAt.current = Date.now();
        setSavedAt(null);
        remoteCb.current?.({ subject: '', bodyHtml: '', cc: '', bcc: '', updatedAt: Date.now() });
      }
    };
    channel?.addEventListener('message', onMessage);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey(scope)) return;
      if (!e.newValue) {
        lastWrittenAt.current = Date.now();
        setSavedAt(null);
        remoteCb.current?.({ subject: '', bodyHtml: '', cc: '', bcc: '', updatedAt: Date.now() });
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue) as EmailDraft;
        applyRemote(parsed);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      channel?.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
    };
  }, [scope, enabled]);

  return { savedAt, clear: () => clearEmailDraft(scope) };
}
