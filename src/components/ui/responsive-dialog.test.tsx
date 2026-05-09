/**
 * Regression test for the iOS keyboard "header drift" bug.
 *
 * When iOS opens the soft keyboard, the visible viewport changes. The
 * fullscreen composer should resize to that viewport, not add fake top
 * padding or let the whole sheet drift into the phone edge.
 *
 * This test simulates the keyboard open/close cycle and asserts:
 *   1. While the keyboard is closed, the drawer uses viewport CSS vars.
 *   2. While the keyboard is open, those vars follow visualViewport.
 *   3. The bottom inset matches the keyboard height.
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
    Object.defineProperty(window, 'innerWidth', {
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
    document.documentElement.style.removeProperty('--composer-viewport-top');
    document.documentElement.style.removeProperty('--composer-viewport-height');
    document.documentElement.style.removeProperty('--composer-safe-bottom');
    // Clean visualViewport mock.
    delete (window as { visualViewport?: unknown }).visualViewport;
  });

  it("pins fullscreen composer chrome to the screen top while only the usable height follows the keyboard", async () => {
    const { vv, fire } = mockVisualViewport();

    const { container } = render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent className="mobile-truly-fullscreen mobile-drawer" aria-describedby={undefined}>
          <div data-testid="header">Header</div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    );

    await flushRaf();

    // Radix portals the SheetContent to document.body.
    const drawer = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(drawer).toBeTruthy();

    // ── 1. Keyboard CLOSED ────────────────────────────────────────────────
    expect(drawer!.style.top).toBe('0px');
    expect(drawer!.style.height).toContain('--composer-viewport-height');
    expect(drawer!.style.bottom).toBe('auto');
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom'))
      .toBe('0px');

    // ── 2. Keyboard OPENS ─────────────────────────────────────────────────
    // We no longer rewrite the drawer's `top`/`bottom` per frame (that was
    // the source of the iOS shake). Instead, the viewport meta's
    // `interactive-widget=resizes-content` shrinks the layout viewport so a
    // `fixed bottom: 0` drawer sits above the keyboard automatically. Our
    // job is just to publish CSS vars + the `data-keyboard-open` flag so
    // siblings (BottomNav, etc.) can react.
    vv.height = 420;
    vv.offsetTop = 120;
    await act(async () => {
      fire();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(drawer!.style.top).toBe('0px');
    expect(drawer!.style.bottom).toBe('auto');
    expect(document.documentElement.style.getPropertyValue('--composer-viewport-top'))
      .toBe('120px');
    expect(document.documentElement.style.getPropertyValue('--composer-viewport-height'))
      .toBe('420px');
    expect(document.documentElement.getAttribute('data-keyboard-open')).toBe('true');
    // Math: innerHeight - visualHeight - offsetTop = 800 - 420 - 120 = 260
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom'))
      .toBe('260px');

    // ── 3. Keyboard CLOSES ────────────────────────────────────────────────
    vv.height = 800;
    vv.offsetTop = 0;
    await act(async () => {
      fire();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(drawer!.style.bottom).toBe('auto');
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
