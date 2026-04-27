import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Persist per-column widths in localStorage so each user's table layout
 * survives reloads. Width is stored as a number (px). Drag-resize handlers
 * write to state immediately for live feedback, then debounce persistence.
 */
export function useColumnWidths(storageKey: string, defaults: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Record<string, number>;
      // Always merge with defaults so newly added columns get a sensible width.
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced persist — avoids hammering localStorage during a drag.
  useEffect(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(widths));
      } catch {
        /* quota / private mode — ignore */
      }
    }, 250);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [widths, storageKey]);

  const setWidth = useCallback((key: string, next: number) => {
    setWidths(prev => {
      const clamped = Math.max(60, Math.min(700, Math.round(next)));
      if (prev[key] === clamped) return prev;
      return { ...prev, [key]: clamped };
    });
  }, []);

  const resetWidths = useCallback(() => setWidths(defaults), [defaults]);

  return { widths, setWidth, resetWidths };
}

/**
 * Mouse-driven column resize handler. Use on a tiny drag-handle element
 * positioned at the right edge of a `<th>`. Returns an `onMouseDown` you
 * attach to the handle; it captures pointer events on `document` until
 * release so the user can drag past the table edge without losing track.
 */
export function useColumnResizer(
  getCurrentWidth: () => number,
  onChange: (next: number) => void,
) {
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, w: getCurrentWidth() };
    const handleMove = (ev: PointerEvent) => {
      if (!startRef.current) return;
      const delta = ev.clientX - startRef.current.x;
      onChange(startRef.current.w + delta);
    };
    const handleUp = () => {
      startRef.current = null;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [getCurrentWidth, onChange]);

  return { onPointerDown };
}
