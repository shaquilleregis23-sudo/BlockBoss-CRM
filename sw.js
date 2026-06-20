const CACHE = 'm2-hybrid-production-v9-lead-sheet';
const CORE = [
  './','./index.html','./styles.css','./manifest.json',
  './js/config.js','./js/state.js','./js/storage.js','./js/leads.js','./js/sync.js',
  './js/map.js','./js/render.js','./js/ui.js','./js/auth.js',
  './js/sms.js','./js/actions.js','./js/app.js',
  './vendor/leaflet-markercluster/leaflet.markercluster.js','./vendor/leaflet-markercluster/MarkerCluster.css','./vendor/leaflet-markercluster/MarkerCluster.Default.css'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
        return response;
      });
      return cached || network.catch(() => caches.match('./index.html'));
    })
  );
});
