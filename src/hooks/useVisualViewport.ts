/**
 * useVisualViewport
 * -----------------
 * Listens to window.visualViewport resize+scroll events and reports the
 * current visual viewport height + whether the iOS soft keyboard is open.
 *
 * Also toggles a `keyboard-open` class on <html> so global CSS (see
 * index.css iOS PWA block) can lock body scroll while the keyboard is up.
 *
 * Pairs with useKeyboardInset (which publishes `--keyboard-inset-bottom`).
 * Use this hook when a component needs to *react* to keyboardOpen
 * transitions (e.g. scroll-to-bottom of a chat) or directly size a fixed
 * container to the visible viewport.
 */
import { useEffect, useState } from 'react';

const KEYBOARD_THRESHOLD = 150;

export function useVisualViewport() {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined') {
      return { viewportHeight: 0, keyboardOpen: false };
    }
    const vh = window.visualViewport?.height ?? window.innerHeight;
    return {
      viewportHeight: vh,
      keyboardOpen: window.innerHeight - vh > KEYBOARD_THRESHOLD,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    const update = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const open = window.innerHeight - vh > KEYBOARD_THRESHOLD;
      setState((prev) =>
        prev.viewportHeight === vh && prev.keyboardOpen === open
          ? prev
          : { viewportHeight: vh, keyboardOpen: open },
      );
      root.classList.toggle('keyboard-open', open);
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    // iOS sometimes delays the visualViewport resize when the device rotates,
    // especially with the soft keyboard up. Force a recalculation 300ms later.
    const onOrientation = () => {
      update();
      window.setTimeout(update, 300);
    };
    window.addEventListener('orientationchange', onOrientation);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', onOrientation);
      root.classList.remove('keyboard-open');
    };
  }, []);

  return state;
}
