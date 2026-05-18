import { useEffect } from 'react';
import { useZaraDock } from '@/stores/useZaraDock';
import { useZaraCommandBar } from '@/stores/useZaraCommandBar';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcuts for Zara.
 *  ⌘K / Ctrl+K  → open command bar (contextual actions, Linear/Notion AI vibe)
 *  ⌘J / Ctrl+J  → toggle dock (chat)
 *  ⌘/           → open dock + focus input
 *  Esc          → close dock when no input focused
 *  /            → focus dock search when dock is already open
 */
export function useZaraKeyboard() {
  const { open: dockOpen, toggle: toggleDock, setOpen: setDockOpen, setShowHistory } = useZaraDock();
  const { toggle: toggleBar } = useZaraCommandBar();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (meta && k === 'k') {
        e.preventDefault();
        toggleBar();
        return;
      }
      if (meta && k === 'j') {
        e.preventDefault();
        toggleDock();
        setTimeout(() => window.dispatchEvent(new Event('zara-dock:focus-input')), 80);
        return;
      }
      if (meta && k === '/') {
        e.preventDefault();
        setDockOpen(true);
        setTimeout(() => window.dispatchEvent(new Event('zara-dock:focus-input')), 50);
        return;
      }

      if (!dockOpen) return;
      if (isTypingTarget(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setDockOpen(false);
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
  }, [dockOpen, toggleDock, setDockOpen, setShowHistory, toggleBar]);
}
