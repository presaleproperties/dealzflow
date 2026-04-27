/**
 * Offline outbox for SMS messages.
 *
 * Persists pending outbound text messages in IndexedDB so they survive page
 * reloads and offline periods, then drains the queue (with exponential backoff)
 * once connectivity returns. Server-side de-dup is enforced via
 * `client_dedupe_id` on `crm_sms_log` so retries can never produce duplicates.
 *
 * Scope (intentional): SMS only. Email/WhatsApp are out of scope for v1.
 */

import { supabase } from '@/integrations/supabase/client';

const DB_NAME = 'commissioniq-offline';
const DB_VERSION = 1;
const STORE_NAME = 'sms_outbox';

const MAX_ATTEMPTS = 5;
// Exponential backoff schedule (ms) — applied after each failed attempt.
const BACKOFF_MS = [2_000, 8_000, 30_000, 120_000, 600_000];

export interface OutboxItem {
  /** UUID — also used as `client_dedupe_id` against the server. */
  id: string;
  /** Lead/contact this message is for (may be null for ad-hoc sends). */
  contact_id: string | null;
  /** Destination phone (E.164 or local — server normalizes). */
  to: string;
  body: string;
  from?: string;
  media_urls?: string[];
  channel: 'sms' | 'whatsapp';
  /** ISO timestamp of when the user pressed Send. */
  enqueued_at: string;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  /** 'pending' = will be retried, 'failed' = exceeded MAX_ATTEMPTS. */
  status: 'pending' | 'failed';
}

// ---------------- IndexedDB helpers ----------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE_NAME, mode);
    const store = t.objectStore(STORE_NAME);
    Promise.resolve(fn(store))
      .then((v) => {
        t.oncomplete = () => resolve(v);
        t.onerror = () => reject(t.error);
      })
      .catch(reject);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- Public API ----------------

export async function listOutbox(): Promise<OutboxItem[]> {
  try {
    return await tx('readonly', (store) => reqToPromise(store.getAll() as IDBRequest<OutboxItem[]>));
  } catch {
    return [];
  }
}

export async function enqueueOutbox(item: Omit<OutboxItem, 'attempts' | 'next_attempt_at' | 'last_error' | 'status' | 'enqueued_at'> & { enqueued_at?: string }): Promise<OutboxItem> {
  const now = new Date().toISOString();
  const full: OutboxItem = {
    ...item,
    enqueued_at: item.enqueued_at ?? now,
    attempts: 0,
    next_attempt_at: now,
    last_error: null,
    status: 'pending',
  };
  await tx('readwrite', (store) => reqToPromise(store.put(full)));
  notifyChange();
  // Try to drain immediately — if we're online it'll send right away.
  void drainOutbox();
  return full;
}

export async function removeFromOutbox(id: string): Promise<void> {
  await tx('readwrite', (store) => reqToPromise(store.delete(id)));
  notifyChange();
}

export async function retryNow(id: string): Promise<void> {
  const items = await listOutbox();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.status = 'pending';
  item.attempts = 0;
  item.next_attempt_at = new Date().toISOString();
  item.last_error = null;
  await tx('readwrite', (store) => reqToPromise(store.put(item)));
  notifyChange();
  void drainOutbox();
}

// ---------------- Change notification ----------------

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChange() {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

// ---------------- Sync engine ----------------

let draining = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Walk the outbox and try each pending item whose `next_attempt_at` has
 * arrived. Successful items are removed; failures are rescheduled.
 */
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  draining = true;
  try {
    const items = await listOutbox();
    const now = Date.now();
    const due = items
      .filter((i) => i.status === 'pending' && new Date(i.next_attempt_at).getTime() <= now)
      .sort((a, b) => new Date(a.enqueued_at).getTime() - new Date(b.enqueued_at).getTime());

    for (const item of due) {
      try {
        const { data, error } = await supabase.functions.invoke('send-sms', {
          body: {
            client_dedupe_id: item.id,
            contact_id: item.contact_id,
            to: item.to,
            body: item.body,
            from: item.from,
            media_urls: item.media_urls,
            channel: item.channel,
            // We always skip the quiet-hours prompt for queued retries — the
            // user already approved sending when they pressed Send originally.
            skip_quiet_hours: true,
          },
        });

        // Treat both transport error and JSON-body error as failure, EXCEPT
        // quiet-hours / opt-out, which are user-state errors we should mark
        // as failed (won't auto-resolve by retrying).
        const bodyErr = (data && typeof data === 'object' && 'error' in data) ? (data as any).error : null;
        const bodyCode = (data && typeof data === 'object' && 'code' in data) ? (data as any).code : null;

        if (error || bodyErr) {
          const message = error?.message || bodyErr || 'Unknown send failure';
          const terminal = bodyCode === 'OPTED_OUT' || bodyCode === 'NO_SENDER' || bodyCode === 'WA_BAD_FORMAT' || bodyCode === 'WA_SENDER_MISMATCH';
          await recordFailure(item, message, terminal);
        } else {
          await removeFromOutbox(item.id);
        }
      } catch (err) {
        await recordFailure(item, err instanceof Error ? err.message : 'Network error', false);
      }
    }
  } finally {
    draining = false;
    notifyChange();
    scheduleNextDrain();
  }
}

async function recordFailure(item: OutboxItem, message: string, terminal: boolean) {
  const attempts = item.attempts + 1;
  const exhausted = terminal || attempts >= MAX_ATTEMPTS;
  const backoff = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
  const updated: OutboxItem = {
    ...item,
    attempts,
    last_error: message,
    status: exhausted ? 'failed' : 'pending',
    next_attempt_at: exhausted ? item.next_attempt_at : new Date(Date.now() + backoff).toISOString(),
  };
  await tx('readwrite', (store) => reqToPromise(store.put(updated)));
}

/** Schedule the next drain at the earliest pending `next_attempt_at`. */
function scheduleNextDrain() {
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
  }
  void listOutbox().then((items) => {
    const next = items
      .filter((i) => i.status === 'pending')
      .map((i) => new Date(i.next_attempt_at).getTime())
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const delay = Math.max(1_000, next - Date.now());
    drainTimer = setTimeout(() => { void drainOutbox(); }, Math.min(delay, 600_000));
  });
}

// ---------------- Global lifecycle wiring ----------------

let started = false;
export function startOutboxEngine() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const trigger = () => { void drainOutbox(); };

  window.addEventListener('online', trigger);
  window.addEventListener('focus', trigger);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') trigger();
  });

  // Initial drain on boot.
  trigger();
}
