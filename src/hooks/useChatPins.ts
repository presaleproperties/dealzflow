// Shared pin-to-top store for chat threads.
// Persists per-browser in localStorage and stays in sync across tabs and
// any consumer (Chats list page, Right-rail Inbox drawer, etc.) via a
// custom event broadcaster so optimistic updates are instantly mirrored.
import { useEffect, useState, useCallback } from 'react';

const KEY = 'crm-chats-pinned-v1';
const EVT = 'crm-chats-pinned-changed';

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeSet(next: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(next)));
  } catch {
    /* quota exceeded — ignore */
  }
  // Notify same-tab listeners (storage event only fires across tabs).
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useChatPins() {
  const [pinned, setPinned] = useState<Set<string>>(() => readSet());

  useEffect(() => {
    const sync = () => setPinned(readSet());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', (e) => { if (e.key === KEY) sync(); });
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync as any);
    };
  }, []);

  const isPinned = useCallback((id: string) => pinned.has(id), [pinned]);

  const toggle = useCallback((id: string) => {
    const next = new Set(readSet());
    if (next.has(id)) next.delete(id); else next.add(id);
    writeSet(next);
    setPinned(next);
    return next.has(id);
  }, []);

  const pinMany = useCallback((ids: string[], on = true) => {
    const next = new Set(readSet());
    for (const id of ids) {
      if (on) next.add(id); else next.delete(id);
    }
    writeSet(next);
    setPinned(next);
  }, []);

  return { pinned, isPinned, toggle, pinMany };
}

/** Sort a list so pinned items come first, preserving original order otherwise. */
export function sortByPinned<T extends { id: string }>(list: T[], pinned: Set<string>): T[] {
  return [...list].sort((a, b) => {
    const ap = pinned.has(a.id) ? 1 : 0;
    const bp = pinned.has(b.id) ? 1 : 0;
    return bp - ap;
  });
}
