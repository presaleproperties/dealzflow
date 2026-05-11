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
    let keyboardOpen = false;
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
      const visualOffsetTop = vv?.offsetTop ?? 0;
      const innerHeight = window.innerHeight || 0;
      const rootHeight = root.clientHeight || 0;
      const layoutHeight = Math.max(innerHeight, rootHeight, visualHeight);
      const editing = isEditableElement(document.activeElement);

      // Keep a stable "keyboard closed" viewport height while an editable has
      // focus. iOS can update window.innerHeight late in the keyboard animation;
      // recalibrating then is what made the composer slide back down and leave a
      // gap above the keyboard.
      if (!editing && !keyboardOpen) {
        stableViewportHeight = Math.max(stableViewportHeight, layoutHeight, visualHeight);
      }

      const fromStable = Math.round(stableViewportHeight - visualHeight - visualOffsetTop);
      const fromLayout = Math.round(rootHeight - visualHeight - visualOffsetTop);
      const fromWindow = Math.round(innerHeight - visualHeight - visualOffsetTop);
      const nativeKeyboardHeight = Number.parseFloat(root.style.getPropertyValue('--kb-h')) || 0;
      const raw = Math.max(0, nativeKeyboardHeight, fromStable, fromLayout, fromWindow);
      const kb = editing && raw > 60 ? raw : 0;
      keyboardOpen = kb > 60;
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
      schedule();
      settleTimer = window.setTimeout(schedule, 180);
    };

    publish();
    document.addEventListener('focusin', publishStableKeyboardOpenInset);
    document.addEventListener('focusout', publishStableKeyboardOpenInset);
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
      document.removeEventListener('focusout', publishStableKeyboardOpenInset);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('scroll', pin, { capture: true } as any);
      root.removeAttribute('data-keyboard-open');
      root.style.setProperty('--keyboard-inset-bottom', '0px');
    };
  }, [enabled]);
}
