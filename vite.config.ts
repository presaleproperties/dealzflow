import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",       // was "autoUpdate" — caused stale CRM flash
      injectRegister: false,        // we'll handle registration manually after auth
      devOptions: { enabled: false },
      includeAssets: ["favicon.png", "icon-192.png", "icon-512.png", "splash-screen.png"],
      manifest: {
        name: "Dealzflow",
        short_name: "Dealzflow",
        description: "Financial clarity for real estate agents — track commissions, project cashflow, know your safe-to-spend",
        theme_color: "#10b981",
        background_color: "#0a0a0b",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/command-center",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/~oauth/],
        // Don't precache the app shell — fetch fresh every time.
        globPatterns: [],
        // Runtime cache: ONLY static assets (icons, fonts), never HTML/JS bundles.
        runtimeCaching: [
          {
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
