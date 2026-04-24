/**
 * Per-template quick-send memory.
 *
 * Persists the last-used subject and recipient roster for each template
 * so reopening the quick-send dialog feels instant. Stored locally per
 * browser (no backend table needed) under a single namespaced key, with
 * a hard cap so the store can't grow unbounded.
 */

const STORAGE_KEY = 'crm.quickSend.memory.v1';
const MAX_TEMPLATES = 50;
const MAX_RECIPIENTS = 50;

export interface QuickSendRecipientMemory {
  id?: string;
  email: string;
  name: string;
}

export interface QuickSendMemoryEntry {
  subject: string;
  recipients: QuickSendRecipientMemory[];
  updatedAt: number;
}

type Store = Record<string, QuickSendMemoryEntry>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === 'undefined') return;
  try {
    // Cap total tracked templates — keep the most recently updated.
    const keys = Object.keys(store);
    if (keys.length > MAX_TEMPLATES) {
      const trimmed: Store = {};
      keys
        .map((k) => [k, store[k].updatedAt ?? 0] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TEMPLATES)
        .forEach(([k]) => {
          trimmed[k] = store[k];
        });
      store = trimmed;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / privacy mode — silently ignore */
  }
}

export function loadQuickSendMemory(templateId: string): QuickSendMemoryEntry | null {
  if (!templateId) return null;
  const entry = read()[templateId];
  return entry ?? null;
}

export function saveQuickSendMemory(
  templateId: string,
  subject: string,
  recipients: QuickSendRecipientMemory[],
) {
  if (!templateId) return;
  const store = read();
  store[templateId] = {
    subject,
    recipients: recipients.slice(0, MAX_RECIPIENTS).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
    })),
    updatedAt: Date.now(),
  };
  write(store);
}

export function clearQuickSendMemory(templateId: string) {
  if (!templateId) return;
  const store = read();
  if (store[templateId]) {
    delete store[templateId];
    write(store);
  }
}
