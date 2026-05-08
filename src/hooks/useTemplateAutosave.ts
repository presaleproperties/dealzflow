import { useEffect, useRef, useState } from 'react';

const PREFIX = 'crm_template_draft:';

export type TemplateDraftSnapshot = Record<string, any>;

/**
 * Local-only autosave for the email template editor. Snapshots the live form
 * state into localStorage every `intervalMs` so a reload / accidental close
 * never loses work. Explicit Save still writes to the database — this hook
 * only handles the rescue copy.
 *
 * Returns `dirty` (snapshot differs from last cleared baseline) and helpers
 * to read or clear the saved draft.
 */
export function useTemplateAutosave(
  key: string,
  snapshot: TemplateDraftSnapshot,
  intervalMs = 3000,
) {
  const [dirty, setDirty] = useState(false);
  const lastSavedRef = useRef<string>('');
  const baselineRef = useRef<string>('');

  // Establish baseline on mount so we don't show "dirty" for unchanged fields.
  useEffect(() => {
    baselineRef.current = JSON.stringify(snapshot);
    lastSavedRef.current = baselineRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const tick = () => {
      try {
        const serialized = JSON.stringify(snapshot);
        const isDirty = serialized !== baselineRef.current;
        setDirty(isDirty);
        if (serialized !== lastSavedRef.current) {
          if (isDirty) {
            localStorage.setItem(PREFIX + key, serialized);
          } else {
            localStorage.removeItem(PREFIX + key);
          }
          lastSavedRef.current = serialized;
        }
      } catch {
        /* swallow — autosave is best-effort */
      }
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [key, snapshot, intervalMs]);

  // Warn before close if dirty
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const clear = () => {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch { /* ignore */ }
    baselineRef.current = JSON.stringify(snapshot);
    lastSavedRef.current = baselineRef.current;
    setDirty(false);
  };

  const readDraft = (): TemplateDraftSnapshot | null => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  return { dirty, clear, readDraft };
}
