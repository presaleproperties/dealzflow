import { useEffect, useRef } from 'react';

const KEYBOARD_THRESHOLD = 150;

export function useVisualViewport() {
  const keyboardOpenRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const vv = window.visualViewport;
    let rafId = 0;
    let loopRunning = false;
    let isAnimating = false;
    let animationTimer = 0;

    function update() {
      const vh = vv ? vv.height : window.innerHeight;
      const fullHeight = window.innerHeight;
      const offset = fullHeight - vh;
      const isOpen = offset > KEYBOARD_THRESHOLD;

      if (isOpen && !keyboardOpenRef.current) {
        // === KEYBOARD JUST OPENED ===
        // Set the offset ONCE immediately, then freeze for 350ms
        keyboardOpenRef.current = true;
        isAnimating = true;
        root.classList.add('keyboard-open');
        root.style.setProperty('--keyboard-offset', offset + 'px');
        root.style.setProperty('--vv-height', vh + 'px');

        // After iOS keyboard animation completes, read the FINAL offset
        clearTimeout(animationTimer);
        animationTimer = window.setTimeout(() => {
          isAnimating = false;
          const settledVh = vv ? vv.height : window.innerHeight;
          const settledOffset = window.innerHeight - settledVh;
          root.style.setProperty('--keyboard-offset', settledOffset + 'px');
          root.style.setProperty('--vv-height', settledVh + 'px');
        }, 350);

      } else if (!isOpen && keyboardOpenRef.current) {
        // === KEYBOARD JUST CLOSED ===
        // Snap back to 0 instantly
        keyboardOpenRef.current = false;
        isAnimating = false;
        clearTimeout(animationTimer);
        root.classList.remove('keyboard-open');
        root.style.setProperty('--keyboard-offset', '0px');
        root.style.setProperty('--vv-height', fullHeight + 'px');

      } else if (isOpen && !isAnimating) {
        // === KEYBOARD ALREADY OPEN AND SETTLED ===
        // Normal update (handles orientation changes, etc.)
        root.style.setProperty('--keyboard-offset', offset + 'px');
        root.style.setProperty('--vv-height', vh + 'px');
      }
      // If isOpen && isAnimating: DO NOTHING — we're frozen during animation

      // Always prevent iOS body scroll when keyboard is open
      if (isOpen) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        root.scrollTop = 0;
      }
    }

    // Continuous RAF loop while keyboard is open — keeps fighting iOS scroll
    function loop() {
      if (!keyboardOpenRef.current) {
        loopRunning = false;
        return;
      }
      update();
      rafId = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (!loopRunning) {
        loopRunning = true;
        rafId = requestAnimationFrame(loop);
      }
    }

    function onViewportChange() {
      update();
      if (keyboardOpenRef.current) {
        startLoop();
      }
    }

    // Initial
    update();

    // Listen to visualViewport events
    if (vv) {
      vv.addEventListener('resize', onViewportChange);
      vv.addEventListener('scroll', onViewportChange);
    }
    window.addEventListener('resize', onViewportChange);

    // Also listen to focus/blur on inputs as a backup trigger
    function onFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        // Keyboard is likely about to open — start polling
        setTimeout(onViewportChange, 100);
        setTimeout(onViewportChange, 300);
        setTimeout(onViewportChange, 600);
        setTimeout(onViewportChange, 1000);
      }
    }
    function onFocusOut() {
      setTimeout(onViewportChange, 100);
      setTimeout(onViewportChange, 300);
    }
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    // Orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(onViewportChange, 100);
      setTimeout(onViewportChange, 300);
      setTimeout(onViewportChange, 500);
    });

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(animationTimer);
      if (vv) {
        vv.removeEventListener('resize', onViewportChange);
        vv.removeEventListener('scroll', onViewportChange);
      }
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--keyboard-offset');
      root.classList.remove('keyboard-open');
    };
  }, []);

  return { keyboardOpenRef };
}
