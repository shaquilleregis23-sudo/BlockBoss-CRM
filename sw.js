// Feature 2: Aggressive Service Worker — v5
// Shell: stale-while-revalidate. Tiles: cache-first + background update.
const CACHE      = 'm2crm-v5';
const TILE_CACHE = 'm2crm-tiles-v1';

const SHELL = [
  './index.html',
  './styles.css',
  './js/config.js',
  './js/state.js',
  './js/leads.js',
  './js/sync.js',
  './js/map.js',
  './js/render.js',
  './js/ui.js',
  './js/auth.js',
  './js/sms.js',
  './js/actions.js',
  './js/app.js',
  './js/sunmode.js',
  './js/fatdisp.js',
  './js/hitfeed.js',
  './js/voice.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
];

const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'cartocdn.com',
  'basemaps.cartocdn.com',
  'arcgisonline.com',
  'services.arcgisonline.com',
  'tile.opentopomap.org',
  'mt0.google.com',
  'mt1.google.com',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE && k !== TILE_CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }

  // Never intercept Supabase API calls — always fresh
  if (url.hostname.includes('supabase.co')) return;

  // Map tiles — cache-first, update in background (zero-latency offline)
  var isTile = TILE_HOSTS.some(function (h) { return url.hostname.includes(h); });
  if (isTile) {
    e.respondWith(
      caches.open(TILE_CACHE).then(function (tc) {
        return tc.match(e.request).then(function (cached) {
          var networkFetch = fetch(e.request).then(function (res) {
            if (res.ok) tc.put(e.request, res.clone());
            return res;
          });
          // Return cached immediately; fetch updates the tile quietly
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // Own origin (shell files) — stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(e.request).then(function (cached) {
          var networkFetch = fetch(e.request).then(function (res) {
            if (res.ok) c.put(e.request, res.clone());
            return res;
          }).catch(function () { return null; });
          // Serve cache instantly; update happens in the background
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // Everything else (CDN, analytics, chat) — network with cache fallback
  e.respondWith(
    fetch(e.request).catch(function () { return caches.match(e.request); })
  );
});
