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
      registerType: "autoUpdate",
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
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/~oauth/],
        // Only pre-cache icons & fonts — NOT JS/CSS bundles (they change on every build)
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
        importScripts: ["/sw-push.js"],
        runtimeCaching: [
          // HTML — always network first, zero cache TTL
          {
            urlPattern: /\.html$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              expiration: { maxEntries: 5, maxAgeSeconds: 0 },
              networkTimeoutSeconds: 4,
            }
          },
          // JS & CSS bundles — network first, short fallback cache (stale while revalidate kills old builds)
          {
            urlPattern: /\.(js|css)(\?.*)?$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "assets-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          // Google Fonts — long-lived cache is fine (immutable)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
