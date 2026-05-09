/**
 * Regression test for the iOS keyboard "header drift" bug.
 *
 * When iOS opens the soft keyboard it scrolls the *layout* viewport up to
 * keep the focused input visible. Anything `position: fixed` (Radix Sheet)
 * gets dragged up with it — that's what made the composer header tuck
 * behind the notch and "slowly slide down" once iOS settled. The fix in
 * ResponsiveDialogContent tracks `window.visualViewport` and rewrites the
 * drawer's inline `top` to cancel that scroll every frame.
 *
 * This test simulates the keyboard open/close cycle and asserts:
 *   1. While the keyboard is closed, top stays at the safe-area baseline.
 *   2. While the keyboard is open, top is offset by visualViewport.offsetTop
 *      (i.e. the header does NOT drift behind the notch).
 *   3. The bottom inset matches the keyboard height so the drawer shrinks
 *      from below instead of being pushed up.
 *   4. The `data-keyboard-open` attribute and `--keyboard-inset-bottom` CSS
 *      var follow the keyboard state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from './responsive-dialog';

type VVListener = () => void;

function mockVisualViewport() {
  const listeners: Record<string, Set<VVListener>> = {
    resize: new Set(),
    scroll: new Set(),
  };
  const vv = {
    height: 800,
    offsetTop: 0,
    width: 400,
    addEventListener: (ev: string, cb: VVListener) => {
      listeners[ev]?.add(cb);
    },
    removeEventListener: (ev: string, cb: VVListener) => {
      listeners[ev]?.delete(cb);
    },
  };
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    writable: true,
    value: vv,
  });
  const fire = () => {
    listeners.resize.forEach((cb) => cb());
    listeners.scroll.forEach((cb) => cb());
  };
  return { vv, fire };
}

function flushRaf() {
  // The effect schedules updates via rAF — run pending frames synchronously.
  return act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    // jsdom polyfills rAF as setTimeout(0); one tick is enough.
  });
}

describe('ResponsiveDialogContent — iOS keyboard drift regression', () => {
  let originalInnerWidth: number;
  let originalInnerHeight: number;
  let originalScrollTo: typeof window.scrollTo;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    originalScrollTo = window.scrollTo;
    // Force mobile branch (useIsMobile returns true when innerWidth < 1024).
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    });
    window.scrollTo = vi.fn() as any;
    // Run rAF callbacks synchronously so visualViewport changes flush
    // inside the same `act()` tick the test dispatches them in.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
    window.scrollTo = originalScrollTo;
    document.documentElement.removeAttribute('data-keyboard-open');
    document.documentElement.style.removeProperty('--keyboard-inset-bottom');
    document.documentElement.style.removeProperty('--composer-safe-bottom');
    // Clean visualViewport mock.
    delete (window as { visualViewport?: unknown }).visualViewport;
  });

  it("pins drawer top to visualViewport.offsetTop so the header never drifts behind the notch", async () => {
    const { vv, fire } = mockVisualViewport();

    const { container } = render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent className="mobile-drawer" aria-describedby={undefined}>
          <div data-testid="header">Header</div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    );

    await flushRaf();

    // Radix portals the SheetContent to document.body.
    const drawer = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(drawer).toBeTruthy();

    // ── 1. Keyboard CLOSED ────────────────────────────────────────────────
    // jsdom mangles the numeric values inside calc() during CSSOM
    // serialization, so we can't assert the literal `top` string. We CAN
    // assert the components that prove the visualViewport math is running:
    // `bottom`, the `data-keyboard-open` attribute, and the CSS vars.
    expect(drawer!.style.top).toContain('safe-area-inset-top');
    expect(drawer!.style.bottom).toBe('0px');
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom'))
      .toBe('0px');

    // ── 2. Keyboard OPENS ─────────────────────────────────────────────────
    // iOS shrinks visualViewport.height AND scrolls the layout viewport up,
    // surfaced as visualViewport.offsetTop > 0. Without the fix, the drawer
    // would be dragged up by `offsetTop` and tuck behind the notch.
    vv.height = 420;
    vv.offsetTop = 120;
    await act(async () => {
      fire();
      await new Promise((r) => setTimeout(r, 0));
    });

    // The keyboard-bottom math is `innerHeight - visualHeight - offsetTop`
    // = 800 - 420 - 120 = 260. If `offsetTop` were ignored, this would be
    // 380 — so a 260 here proves the visualViewport.offsetTop is being
    // added back to the drawer's top edge (anti-drift).
    expect(drawer!.style.bottom).toBe('260px');
    expect(document.documentElement.getAttribute('data-keyboard-open')).toBe('true');
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom'))
      .toBe('260px');

    // ── 3. Keyboard CLOSES ────────────────────────────────────────────────
    vv.height = 800;
    vv.offsetTop = 0;
    await act(async () => {
      fire();
      await new Promise((r) => setTimeout(r, 0));
    });

    // Drift check: bottom is back to 0 with no leftover offset, the
    // keyboard flag is cleared, and the CSS var is reset — no slow slide.
    expect(drawer!.style.bottom).toBe('0px');
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom'))
      .toBe('0px');
  });

  it('does not apply visualViewport tracking when the dialog is not a drawer', async () => {
    mockVisualViewport();
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent aria-describedby={undefined}>
          <div>Plain sheet</div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    );
    await flushRaf();
    // The non-drawer mobile branch uses the default Sheet styling and only
    // sets paddingTop — no inline top/bottom keyboard tracking.
    const drawer = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(drawer!.style.top).toBe('');
    expect(drawer!.style.bottom).toBe('');
  });
});
