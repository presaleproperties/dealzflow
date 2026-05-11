import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.4a1d5535c7194b9087894be05903a331',
  appName: 'commissioniq',
  webDir: 'dist',
  // Hot-reload from the Lovable sandbox preview so changes you push here
  // show up live on the device. Remove `server` for a fully bundled build.
  server: {
    url: 'https://4a1d5535-c719-4b90-8789-4be05903a331.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0F172A',
  },
  android: {
    backgroundColor: '#0F172A',
  },
  plugins: {
    Keyboard: {
      // Keep the WebView stable; composers use the shared --keyboard-inset-bottom
      // / --kb-h CSS vars so iOS does not double-resize and jump input pills.
      resize: 'none',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      // Match the dark glass header used across CRM screens.
      style: 'DARK',
      backgroundColor: '#0F172A',
      overlaysWebView: false,
    },
  },
};

export default config;
