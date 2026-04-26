import { get, set, del } from 'idb-keyval';
import {
  experimental_createQueryPersister,
  type AsyncStorage,
  type PersistedQuery,
} from '@tanstack/react-query-persist-client';

/**
 * IndexedDB-backed React Query persister.
 *
 * Why IndexedDB and not the service worker?
 *   This project disabled SW response caching to fix the "old version
 *   flashing" bug (see vite.config.ts and src/main.tsx). React Query's
 *   per-query persister gives us instant reopens of lead detail and chat
 *   thread pages WITHOUT caching HTML/JS bundles, so we get the perceived
 *   speed of a PWA cache without the staleness risk.
 *
 * Bumping CACHE_BUSTER invalidates every persisted entry on next boot —
 * use this when the shape of a cached query changes.
 */
const CACHE_BUSTER = 'v1';

const idbStorage: AsyncStorage<PersistedQuery> = {
  getItem: (key) => get<PersistedQuery>(key),
  setItem: (key, value) => set(key, value),
  removeItem: (key) => del(key),
};

/**
 * Allow-list of query keys that are safe + valuable to persist. Persisting
 * arbitrary queries can leak PII into IDB; we only persist things that are
 * cheap to refetch and high-value on cold open.
 */
const PERSISTABLE_KEY_PREFIXES = [
  'crm-contact',           // single lead detail
  'crm-contact-messages',  // lead activity
  'crm-contacts-lite',     // leads list
  'crm-chats',             // inbox rows
  'crm-chat-thread',       // single thread + contact join
  'crm-chat-thread-messages',
];

function shouldPersist(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return typeof head === 'string' && PERSISTABLE_KEY_PREFIXES.includes(head);
}

export const idbPersister = experimental_createPersister<PersistedQuery>({
  storage: idbStorage,
  // Keep persisted entries for 24h on disk, then re-fetch on next open.
  maxAge: 1000 * 60 * 60 * 24,
  prefix: `lovable-rq-${CACHE_BUSTER}`,
  filters: { predicate: (query) => shouldPersist(query.queryKey) },
});
