/**
 * useKeyboardInset
 * ----------------
 * Publishes the iOS soft-keyboard height as `--keyboard-inset-bottom` on
 * <html>, so any component can ride the keyboard with
 *   `transform: translate3d(0, calc(var(--keyboard-inset-bottom) * -1), 0)`
 * and any scroll container can pad with
 *   `padding-bottom: calc(<base> + var(--keyboard-inset-bottom))`.
 *
 * Required because the app uses `interactive-widget=overlays-content` — iOS
 * does NOT resize the layout viewport, so `position: sticky bottom-0` stays
 * pinned BELOW the keyboard. We measure visualViewport and translate
 * manually instead.
 *
 * Side-effects are idempotent: multiple consumers can mount this hook and
 * the listener / publish loop runs once per mount; the variable simply
 * reflects the latest measurement. Also locks the body so iOS Safari can't
 * pan the window upward to chase the focused input (the visible "shake").
 */
import { useEffect } from 'react';

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
}

export function useKeyboardInset(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const root = document.documentElement;

    let frame = 0;
    let last = -1;
    let stableViewportHeight = Math.max(
      window.innerHeight || 0,
      root.clientHeight || 0,
      window.visualViewport?.height || 0,
    );

    const publish = () => {
      frame = 0;
      const vv = window.visualViewport;
      const visualHeight = vv?.height ?? window.innerHeight;
      const layoutHeight = Math.max(window.innerHeight || 0, root.clientHeight || 0, visualHeight);
      const editing = isEditableElement(document.activeElement);

      // iOS installed PWAs sometimes shrink `window.innerHeight` late in the
      // keyboard animation. If we calculate from that moving value, the inset
      // decays back toward 0 and the composer slides under the keyboard. Keep a
      // stable "keyboard closed" viewport height and measure against that.
      if (!editing || visualHeight >= stableViewportHeight - 80) {
        stableViewportHeight = Math.max(stableViewportHeight, layoutHeight, visualHeight);
      }

      const kb = Math.max(0, Math.round(stableViewportHeight - visualHeight));
      if (kb === last) return;
      last = kb;
      root.style.setProperty('--keyboard-inset-bottom', `${kb}px`);
      if (kb > 60) root.setAttribute('data-keyboard-open', 'true');
      else root.removeAttribute('data-keyboard-open');
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(publish);
    };

    publish();
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);

    // Pin the window — iOS still tries to pan the layout viewport even with
    // overlays-content. That pan is what visually shakes the page upward.
    const pin = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    window.addEventListener('scroll', pin, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('scroll', pin);
      root.removeAttribute('data-keyboard-open');
      root.style.setProperty('--keyboard-inset-bottom', '0px');
    };
  }, [enabled]);
}
