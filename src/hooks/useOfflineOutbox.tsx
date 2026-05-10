import { useEffect, useState, useCallback } from 'react';
import {
  type OutboxItem,
  listOutbox,
  subscribeOutbox,
  drainOutbox,
  retryNow,
  removeFromOutbox,
} from '@/lib/offlineOutbox';

/**
 * Live view of the SMS offline outbox. Useful for showing a "queued" badge
 * in the chat thread or a banner on the chats list.
 */
export function useOfflineOutbox(opts?: { contactId?: string | null }) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listOutbox().then((list) => {
        if (cancelled) return;
        setItems(list);
      });
    };
    refresh();
    const unsub = subscribeOutbox(refresh);

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const filtered = opts?.contactId
    ? items.filter((i) => i.contact_id === opts.contactId)
    : items;

  return {
    items: filtered,
    pendingCount: filtered.filter((i) => i.status === 'pending').length,
    failedCount: filtered.filter((i) => i.status === 'failed').length,
    online,
    drainNow: useCallback(() => drainOutbox(), []),
    retry: useCallback((id: string) => retryNow(id), []),
    remove: useCallback((id: string) => removeFromOutbox(id), []),
  };
}
