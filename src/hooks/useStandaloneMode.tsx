import { useEffect } from 'react';
import { setStatusBar, isNative } from '@/lib/native';

/**
 * Detects whether the app is running as an installed PWA (Add to Home Screen)
 * or any other standalone display mode, and applies a global `is-standalone`
 * class on <html> so CSS in index.css can give it the full native treatment
 * (safe-area padding, no rubber-band, no tap highlight, no input zoom,
 * SF font on iOS, fixed body, etc.).
 *
 * Also keeps the iOS status-bar / Android theme-color in sync with the
 * current theme so the chrome around the app blends with the page (matching
 * the user's "match page" preference).
 */
export function useStandaloneMode() {
  useEffect(() => {
    const root = document.documentElement;

    const detect = () => {
      const standaloneMQ =
        typeof window.matchMedia === 'function' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches);
      // iOS Safari exposes navigator.standalone for home-screen apps
      const iosStandalone = (window.navigator as any).standalone === true;
      return standaloneMQ || iosStandalone || isNative;
    };

    const apply = () => {
      if (detect()) root.classList.add('is-standalone');
      else root.classList.remove('is-standalone');
    };

    apply();

    // Re-evaluate when the user installs / launches mid-session
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => apply();
    try { mq.addEventListener('change', onChange); }
    catch { mq.addListener(onChange); }

    return () => {
      try { mq.removeEventListener('change', onChange); }
      catch { mq.removeListener(onChange); }
    };
  }, []);

  // Keep the status-bar / theme-color in sync with the active theme.
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const isDark = root.classList.contains('dark');

      // Read the actual background color the page is rendering so the
      // status-bar / nav-chrome blends seamlessly.
      const bg = getComputedStyle(root).getPropertyValue('--background').trim();
      const themeColor = bg ? `hsl(${bg})` : (isDark ? '#0a0a0b' : '#fafafa');

      // Update the *active* theme-color meta so iOS/Android color the chrome
      // around the standalone window to match the page.
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', themeColor);

      // Capacitor status-bar style — light icons over dark bg, dark icons over light bg
      setStatusBar(isDark ? 'light' : 'dark');
    };

    sync();

    // Re-run whenever the theme class on <html> flips (next-themes toggles it)
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);
}
