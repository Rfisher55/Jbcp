// Service Worker — shell caching + offline fallback
const CACHE = 'cop-v33';
const BASE  = self.registration.scope;
const V     = '?v=33';

const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'css/style.css' + V,
  BASE + 'js/config.js'  + V,
  BASE + 'js/db.js'      + V,
  BASE + 'js/auth.js'    + V,
  BASE + 'js/mission.js' + V,
  BASE + 'js/mgrs-grid.js' + V,
  BASE + 'js/symbols.js' + V,
  BASE + 'js/bft.js'     + V,
  BASE + 'js/chat.js'    + V,
  BASE + 'js/reports.js' + V,
  BASE + 'js/map.js'     + V,
  BASE + 'js/hhour.js'   + V,
  BASE + 'js/app.js'     + V,
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

  // HTML (index.html): network-first so deployments reach users immediately
  if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
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
