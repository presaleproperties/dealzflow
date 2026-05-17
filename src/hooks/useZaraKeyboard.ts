import { useEffect } from 'react';
import { useZaraDock } from '@/stores/useZaraDock';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcuts for the Zara dock.
 * - Cmd/Ctrl+J → toggle dock
 * - Cmd/Ctrl+K → open + new conversation + focus input
 * - Cmd/Ctrl+/ → open + focus chat input
 * - Esc       → close dock (when no input focused)
 * - /         → open + focus history search (when no input focused)
 */
export function useZaraKeyboard() {
  const { open, toggle, setOpen, setShowHistory, setConversationId } = useZaraDock();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (meta && k === 'j') {
        e.preventDefault();
        toggle();
        setTimeout(() => window.dispatchEvent(new Event('zara-dock:focus-input')), 80);
        return;
      }
      if (meta && k === 'k') {
        e.preventDefault();
        setOpen(true);
        setConversationId(null);
        setTimeout(() => window.dispatchEvent(new Event('zara-dock:new-and-focus')), 50);
        return;
      }
      if (meta && k === '/') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => window.dispatchEvent(new Event('zara-dock:focus-input')), 50);
        return;
      }

      if (!open) return;
      if (isTypingTarget(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        setShowHistory(true);
        setTimeout(() => window.dispatchEvent(new Event('zara-dock:focus-search')), 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, toggle, setOpen, setShowHistory, setConversationId]);
}
