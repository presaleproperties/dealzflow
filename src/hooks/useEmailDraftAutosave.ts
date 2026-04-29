import { useEffect, useRef, useState } from 'react';

export type EmailDraft = {
  subject: string;
  bodyHtml: string;
  cc?: string;
  bcc?: string;
  updatedAt: number;
};

const KEY_PREFIX = 'crm:email-draft:v1:';

const storageKey = (scope: string) => `${KEY_PREFIX}${scope}`;

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
  } catch {
    /* ignore */
  }
}

/**
 * Lightweight localStorage-backed autosave for email composers.
 * - Debounced 600ms
 * - Skips empty drafts
 * - Tracks `savedAt` for UI hints ("Saved · just now")
 *
 * Pass `enabled=false` (e.g. dialog closed) to pause writes.
 */
export function useEmailDraftAutosave(
  scope: string,
  draft: Omit<EmailDraft, 'updatedAt'>,
  enabled: boolean,
) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const stripped = (draft.bodyHtml || '').replace(/<[^>]*>/g, '').trim();
    const hasContent = !!(draft.subject?.trim() || stripped);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (!hasContent) {
          localStorage.removeItem(storageKey(scope));
          return;
        }
        const payload: EmailDraft = { ...draft, updatedAt: Date.now() };
        localStorage.setItem(storageKey(scope), JSON.stringify(payload));
        setSavedAt(payload.updatedAt);
      } catch {
        /* quota or serialization error — ignore */
      }
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scope, enabled, draft.subject, draft.bodyHtml, draft.cc, draft.bcc]);

  return { savedAt, clear: () => clearEmailDraft(scope) };
}
