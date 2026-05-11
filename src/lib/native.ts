/**
 * Thin wrapper around Capacitor plugins so the rest of the app can call
 * `haptic('light')` etc. without caring whether we're running in the native
 * shell or a regular browser. Every helper is a no-op on the web.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { App } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

// ── Haptics ─────────────────────────────────────────────────────────────────
type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export async function haptic(kind: HapticKind = 'light') {
  if (!isNative) return;
  try {
    switch (kind) {
      case 'light':     return await Haptics.impact({ style: ImpactStyle.Light });
      case 'medium':    return await Haptics.impact({ style: ImpactStyle.Medium });
      case 'heavy':     return await Haptics.impact({ style: ImpactStyle.Heavy });
      case 'success':   return await Haptics.notification({ type: NotificationType.Success });
      case 'warning':   return await Haptics.notification({ type: NotificationType.Warning });
      case 'error':     return await Haptics.notification({ type: NotificationType.Error });
      case 'selection': return await Haptics.selectionChanged();
    }
  } catch { /* noop on unsupported devices */ }
}

// ── Status bar ──────────────────────────────────────────────────────────────
export async function setStatusBar(style: 'dark' | 'light' = 'dark') {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light });
  } catch { /* noop */ }
}

// ── Keyboard listeners (used by composers to keep input in view) ────────────
export function onKeyboardShow(cb: (height: number) => void) {
  if (!isNative) return () => {};
  const handle = Keyboard.addListener('keyboardWillShow', (info) => cb(info.keyboardHeight));
  return () => { handle.then((h) => h.remove()); };
}
export function onKeyboardHide(cb: () => void) {
  if (!isNative) return () => {};
  const handle = Keyboard.addListener('keyboardWillHide', () => cb());
  return () => { handle.then((h) => h.remove()); };
}

export async function setKeyboardResizeNone() {
  if (!isNative) return;
  try { await Keyboard.setResizeMode({ mode: KeyboardResize.None }); } catch { /* noop */ }
}

export async function hideKeyboardAccessoryBar() {
  if (!isNative || platform !== 'ios') return;
  try { await Keyboard.setAccessoryBarVisible({ isVisible: false }); } catch { /* noop */ }
}

// ── Hardware back-button (Android) ──────────────────────────────────────────
/**
 * Register a handler for Android's hardware back button. The most-recently
 * registered handler wins (LIFO), so screens like a conversation can pop back
 * to the inbox first instead of exiting the app.
 *
 * Returns an unsubscribe fn — call it in a useEffect cleanup.
 */
const backStack: Array<() => boolean | Promise<boolean>> = [];
let backWired = false;

function ensureBackWired() {
  if (backWired || !isNative) return;
  backWired = true;
  App.addListener('backButton', async () => {
    for (let i = backStack.length - 1; i >= 0; i--) {
      const handled = await backStack[i]();
      if (handled) return;
    }
    App.exitApp();
  });
}

export function onHardwareBack(handler: () => boolean | Promise<boolean>) {
  ensureBackWired();
  backStack.push(handler);
  return () => {
    const idx = backStack.indexOf(handler);
    if (idx >= 0) backStack.splice(idx, 1);
  };
}
