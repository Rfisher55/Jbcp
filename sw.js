// Service Worker — Phase 0: basic shell caching + offline fallback
const CACHE   = 'cop-v1';
const SHELL   = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/db.js',
  '/js/auth.js',
  '/js/mission.js',
  '/js/mgrs-grid.js',
  '/js/symbols.js',
  '/js/map.js',
  '/js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network-first for Supabase / CDN
  if (url.hostname.includes('supabase') || url.hostname.includes('unpkg') ||
      url.hostname.includes('jsdelivr') || url.hostname.includes('cdnjs')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Tile requests: cache-first with network fallback
  if (url.pathname.includes('/tile/') || url.hostname.includes('tile.openstreetmap') ||
      url.hostname.includes('arcgisonline')) {
    e.respondWith(
      caches.open('cop-tiles').then(c =>
        c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
          c.put(e.request, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // App shell: cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
