/**
 * Tier 4 — ComposerMount
 *
 * Mounts the one-and-only <UnifiedComposer /> at the app root and registers
 * global keyboard shortcuts:
 *   • Cmd/Ctrl + E → openComposer({ channel: 'email' })
 *   • Cmd/Ctrl + T → openComposer({ channel: 'text' })
 *
 * Shortcuts ignore input/textarea/contentEditable targets so they don't
 * hijack typing.
 */
import { useEffect } from 'react';
import { UnifiedComposer } from './UnifiedComposer';
import { useComposerStore } from '@/stores/useComposer';

export function ComposerMount() {
  const openComposer = useComposerStore((s) => s.openComposer);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key !== 'e' && key !== 't') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      openComposer({ channel: key === 'e' ? 'email' : 'text' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openComposer]);

  return <UnifiedComposer />;
}
