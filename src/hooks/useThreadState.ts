// Per-device, per-thread UI state — mute, archive, unread marker, and reactions.
// Stored in localStorage so it's instant and private (no DB roundtrip).
// Keyed by `${channel}:${phoneLast10}`.
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'crm:sms:thread-state:v1';
const REACTIONS_KEY = 'crm:sms:reactions:v1';
const EVENT = 'crm-sms-thread-state-changed';

export type ThreadFlag = 'muted' | 'archived' | 'unread';

interface ThreadStateEntry {
  muted?: boolean;
  archived?: boolean;
  unread?: boolean; // user manually marked as unread
  lastReadAt?: number; // timestamp of last seen message
}

type Store = Record<string, ThreadStateEntry>; // key -> entry
type ReactionsStore = Record<string, string>; // messageId -> emoji

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(next: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* ignore */ }
}

function readReactions(): ReactionsStore {
  try {
    const raw = localStorage.getItem(REACTIONS_KEY);
    return raw ? (JSON.parse(raw) as ReactionsStore) : {};
  } catch {
    return {};
  }
}

function writeReactions(next: ReactionsStore) {
  try {
    localStorage.setItem(REACTIONS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* ignore */ }
}

const makeKey = (channel: string, phoneKey: string) => `${channel}:${phoneKey}`;

export function useThreadState() {
  const [store, setStore] = useState<Store>(() => readStore());
  const [reactions, setReactions] = useState<ReactionsStore>(() => readReactions());

  useEffect(() => {
    const sync = () => {
      setStore(readStore());
      setReactions(readReactions());
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const get = useCallback(
    (channel: string, phoneKey: string): ThreadStateEntry =>
      store[makeKey(channel, phoneKey)] || {},
    [store],
  );

  const update = useCallback(
    (channel: string, phoneKey: string, patch: Partial<ThreadStateEntry>) => {
      const next = { ...readStore() };
      const k = makeKey(channel, phoneKey);
      next[k] = { ...next[k], ...patch };
      // Clean up empty entries
      const e = next[k];
      if (!e.muted && !e.archived && !e.unread && !e.lastReadAt) delete next[k];
      writeStore(next);
    },
    [],
  );

  const isMuted = useCallback(
    (c: string, k: string) => !!get(c, k).muted,
    [get],
  );
  const isArchived = useCallback(
    (c: string, k: string) => !!get(c, k).archived,
    [get],
  );
  const isManuallyUnread = useCallback(
    (c: string, k: string) => !!get(c, k).unread,
    [get],
  );

  const toggleMute = useCallback(
    (c: string, k: string) => update(c, k, { muted: !get(c, k).muted }),
    [get, update],
  );
  const toggleArchive = useCallback(
    (c: string, k: string) => update(c, k, { archived: !get(c, k).archived }),
    [get, update],
  );
  const markUnread = useCallback(
    (c: string, k: string) => update(c, k, { unread: true, lastReadAt: 0 }),
    [update],
  );
  const markRead = useCallback(
    (c: string, k: string) => update(c, k, { unread: false, lastReadAt: Date.now() }),
    [update],
  );

  const getReaction = useCallback(
    (messageId: string) => reactions[messageId] || null,
    [reactions],
  );

  const setReaction = useCallback((messageId: string, emoji: string | null) => {
    const next = { ...readReactions() };
    if (!emoji) delete next[messageId];
    else next[messageId] = emoji;
    writeReactions(next);
  }, []);

  return {
    get,
    isMuted,
    isArchived,
    isManuallyUnread,
    toggleMute,
    toggleArchive,
    markUnread,
    markRead,
    getReaction,
    setReaction,
  };
}
