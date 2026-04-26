import { useEffect } from 'react';
import {
  isNative, platform, setStatusBar, setKeyboardResizeNative,
  onKeyboardShow, onKeyboardHide,
} from '@/lib/native';

/**
 * Bootstraps native-shell behavior once the app mounts:
 * - Adds an `is-native` / `is-ios` / `is-android` class to <html> so CSS can
 *   target the native shell (e.g. extra padding for the status bar / home
 *   indicator).
 * - Sets the status bar style to match our dark glass header.
 * - Switches the iOS keyboard to native resize so messaging composers stay
 *   above the keyboard automatically.
 * - Exposes the live keyboard height as `--kb-h` on <html> so screens that
 *   need extra control (chat scroll-to-bottom) can react.
 */
export function useNativeShell() {
  useEffect(() => {
    const root = document.documentElement;
    if (isNative) root.classList.add('is-native');
    if (platform === 'ios') root.classList.add('is-ios');
    if (platform === 'android') root.classList.add('is-android');

    // Status bar style is now driven by useStandaloneMode() so it follows
    // the active theme instead of being hard-coded to dark.
    setKeyboardResizeNative;

    const off1 = onKeyboardShow((h) => root.style.setProperty('--kb-h', `${h}px`));
    const off2 = onKeyboardHide(() => root.style.setProperty('--kb-h', '0px'));
    return () => { off1(); off2(); };
  }, []);
}
