import { useEffect, useRef, useState, type RefObject } from 'react';

type Options = {
  /** The element that should accept drops + clipboard pastes. */
  targetRef: RefObject<HTMLElement | null>;
  /** Called with any files dropped or pasted. */
  onFiles: (files: File[]) => void;
  /** Optional accept filter (mime prefixes). Defaults to all files. */
  accept?: string[];
  /** Disable the listeners (e.g. when dialog is closed). */
  enabled?: boolean;
};

/**
 * Wires drag-and-drop + clipboard-paste of files/images onto an element.
 * - Returns `dragActive` so the caller can render a hover overlay.
 * - Filters by `accept` mime prefixes when provided (e.g. ['image/']).
 * - Safe to mount unconditionally; toggle with `enabled`.
 */
export function useDragAndPasteFiles({ targetRef, onFiles, accept, enabled = true }: Options) {
  const [dragActive, setDragActive] = useState(false);
  // Counter handles nested dragenter/dragleave (so leaving a child doesn't reset).
  const counter = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const el = targetRef.current;
    if (!el) return;

    const matches = (file: File) =>
      !accept || accept.length === 0 || accept.some((a) => file.type.startsWith(a));

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      counter.current += 1;
      setDragActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      counter.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files).filter(matches);
      if (files.length) onFiles(files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && matches(f)) files.push(f);
        }
      }
      if (files.length) {
        // Don't preventDefault for plain text pastes — only when image files exist.
        e.preventDefault();
        onFiles(files);
      }
    };

    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    el.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('paste', onPaste);
      counter.current = 0;
      setDragActive(false);
    };
  }, [targetRef, onFiles, accept, enabled]);

  return { dragActive };
}
