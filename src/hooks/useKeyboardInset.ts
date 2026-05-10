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
    let settleTimer = 0;
    let last = -1;
    const initialViewportHeight = Math.max(
      window.innerHeight || 0,
      root.clientHeight || 0,
      window.visualViewport?.height || 0,
    );
    let stableViewportHeight = initialViewportHeight;

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

      const raw = Math.max(0, Math.round(stableViewportHeight - visualHeight));
      const kb = editing && raw > 60 ? raw : 0;
      if (kb === last) return;
      last = kb;
      root.style.setProperty('--keyboard-inset-bottom', `${kb}px`);
      if (kb > 60) root.setAttribute('data-keyboard-open', 'true');
      else root.removeAttribute('data-keyboard-open');
    };

    const schedule = () => {
      // Publish synchronously — iOS fires `visualViewport.resize` on every
      // frame of the keyboard slide, so we want the composer transform to
      // match that frame exactly. Gating through rAF introduces a 1-frame
      // lag that reads as the composer "chasing" the keyboard.
      publish();
    };

    const publishStableKeyboardOpenInset = () => {
      window.clearTimeout(settleTimer);
      const vv = window.visualViewport;
      if (!vv || !isEditableElement(document.activeElement)) return;
      const immediate = Math.max(0, Math.round(stableViewportHeight - vv.height));
      if (immediate > 60 && immediate !== last) {
        last = immediate;
        root.style.setProperty('--keyboard-inset-bottom', `${immediate}px`);
        root.setAttribute('data-keyboard-open', 'true');
      }
      settleTimer = window.setTimeout(schedule, 180);
    };

    publish();
    document.addEventListener('focusin', publishStableKeyboardOpenInset);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);

    // Pin the window in capture phase, before any layout settles. With the
    // chat thread mounted, body is `position: fixed` so this is a no-op
    // belt-and-suspenders for any other route that also focuses an input.
    const pin = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    window.addEventListener('scroll', pin, { passive: true, capture: true });

    return () => {
      window.clearTimeout(settleTimer);
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('focusin', publishStableKeyboardOpenInset);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('scroll', pin, { capture: true } as any);
      root.removeAttribute('data-keyboard-open');
      root.style.setProperty('--keyboard-inset-bottom', '0px');
    };
  }, [enabled]);
}
