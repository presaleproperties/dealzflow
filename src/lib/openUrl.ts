// S10: Open external URLs in the right shell.
// In native (Capacitor) we use the in-app browser so the user stays in our app.
// On web we use window.open with noopener.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export async function openExternal(url: string) {
  if (!url) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
      return;
    }
  } catch (e) {
    console.warn('[openExternal] Browser.open failed, falling back to window.open', e);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
