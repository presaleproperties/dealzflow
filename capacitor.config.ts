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
    // Edge-to-edge: let the WebView fill the entire screen (under status bar
    // and home indicator). Our CSS handles safe-area padding via env() insets.
    contentInset: 'never',
    backgroundColor: '#FFFFFF',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: '#FFFFFF',
  },
  plugins: {
    Keyboard: {
      // 'native' lets iOS push the composer up smoothly with the keyboard,
      // mirroring the Messages / WhatsApp behavior.
      resize: 'native',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      // Edge-to-edge: status bar overlays the WebView so the app background
      // flows behind it. Use light icons on our gold/dark headers.
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
