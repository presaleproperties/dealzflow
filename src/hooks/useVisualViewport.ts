/**
 * useVisualViewport
 * -----------------
 * Writes `--vv-height` and `--keyboard-offset` CSS custom properties on
 * <html> in sync with `window.visualViewport`, and toggles a
 * `keyboard-open` class. No React state — components read the CSS vars
 * via `height: var(--vv-height, 100dvh)` so the browser compositor pins
 * fixed containers in the SAME frame the viewport changes (instead of
 * waiting 1–3 frames for a React re-render → causing the iOS PWA
 * "composer slides back down" bug).
 *
 * Mount once at the app root.
 */
import { useEffect, useRef } from 'react';

const KEYBOARD_THRESHOLD = 150;

export function useVisualViewport() {
  const keyboardOpenRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const vv = window.visualViewport;

    function update() {
      const vh = vv ? vv.height : window.innerHeight;
      const offset = window.innerHeight - vh;
      const isOpen = offset > KEYBOARD_THRESHOLD;

      root.style.setProperty('--vv-height', `${vh}px`);
      root.style.setProperty('--keyboard-offset', `${offset}px`);

      if (isOpen !== keyboardOpenRef.current) {
        keyboardOpenRef.current = isOpen;
        root.classList.toggle('keyboard-open', isOpen);
        if (isOpen) root.setAttribute('data-keyboard-open', 'true');
        else root.removeAttribute('data-keyboard-open');
      }

      if (isOpen) {
        // Standalone PWA: prevent iOS from panning the body behind the
        // fixed chat container while the keyboard is up.
        document.body.scrollTop = 0;
        root.scrollTop = 0;
      }
    }

    let rafId = 0;
    function onViewportChange() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    }

    update();

    if (vv) {
      vv.addEventListener('resize', onViewportChange);
      vv.addEventListener('scroll', onViewportChange);
    }
    window.addEventListener('resize', onViewportChange);

    const onOrientation = () => {
      setTimeout(onViewportChange, 100);
      setTimeout(onViewportChange, 300);
    };
    window.addEventListener('orientationchange', onOrientation);

    return () => {
      cancelAnimationFrame(rafId);
      if (vv) {
        vv.removeEventListener('resize', onViewportChange);
        vv.removeEventListener('scroll', onViewportChange);
      }
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onOrientation);
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--keyboard-offset');
      root.classList.remove('keyboard-open');
      root.removeAttribute('data-keyboard-open');
    };
  }, []);

  return { keyboardOpenRef };
}
