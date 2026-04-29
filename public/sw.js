// Service worker mínimo válido (requisito de instalabilidad PWA)
// No cachea respuestas dinámicas para no interferir con Supabase ni la app.
const CACHE_NAME = 'riego-shell-v2';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Fetch handler obligatorio para que el navegador considere la PWA instalable.
// Estrategia: network-first, con fallback a cache solo para navegaciones HTML.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ignorar todo lo que no sea mismo origen (Supabase, CDNs, etc.)
  if (url.origin !== self.location.origin) return;

  // Solo manejar navegaciones HTML
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
  }
});
