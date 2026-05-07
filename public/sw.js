/* eslint-disable no-restricted-globals */
// Minimal asset-only service worker.
// SAFE: only caches Vite's content-hashed /assets/* files (immutable per build).
// NEVER caches: index.html, API calls, Supabase requests, anything else.
// This avoids the "old version flashing" bug that full SW response caching caused.

// Bump VERSION on any deploy that ships safe-area / layout fixes that
// must invalidate the cached /assets/* CSS chunks.
const VERSION = "v5-2026-05-07-purge-old-dealzflow";
const CACHE_NAME = `dealzflow-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  // Activate the new SW immediately so users get the update flow promptly.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any old asset caches from previous SW versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("dealzflow-assets-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Allow the page to trigger an immediate skipWaiting if a user clicks "Refresh"
// while a new SW is in the waiting state.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin /assets/* (Vite-emitted hashed files).
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/assets/")) return;

  // Cache-first for hashed assets — they're immutable, so a hit is always correct.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // Last-ditch: if the network fails, return whatever we have (may be undefined).
        return cached || Response.error();
      }
    })()
  );
});
