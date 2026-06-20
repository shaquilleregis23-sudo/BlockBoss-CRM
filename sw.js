const CACHE = 'm2-hybrid-production-v15-sequence-progress-health-tests';
const TILE_CACHE = 'm2-map-tiles-v1';
const CORE = [
  './','./index.html','./styles.css','./manifest.json',
  './vendor/leaflet/leaflet.css','./vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/marker-icon.png','./vendor/leaflet/images/marker-icon-2x.png','./vendor/leaflet/images/marker-shadow.png',
  './vendor/supabase/supabase.js',
  './js/config.js','./js/state.js','./js/storage.js','./js/leads.js','./js/sync.js',
  './js/map.js','./js/render.js','./js/ui.js','./js/auth.js',
  './js/sms.js','./js/actions.js','./js/app.js',
  './vendor/leaflet-markercluster/leaflet.markercluster.js','./vendor/leaflet-markercluster/MarkerCluster.css','./vendor/leaflet-markercluster/MarkerCluster.Default.css'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(CORE.map(async url=>{
    const response=await fetch(new Request(url,{cache:'reload'}));
    if(!response.ok)throw new Error('Precache failed: '+url);
    await cache.put(url,response);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trimCache(name,max){const cache=await caches.open(name),keys=await cache.keys();if(keys.length>max)await Promise.all(keys.slice(0,keys.length-max).map(k=>cache.delete(k)));}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put('./index.html',res.clone()));return res;}).catch(()=>caches.match('./index.html')));return;}
  const isTile=/cartocdn\.com$/.test(url.hostname)||/arcgisonline\.com$/.test(url.hostname);
  if(isTile){event.respondWith(caches.open(TILE_CACHE).then(async cache=>{const hit=await cache.match(event.request);if(hit)return hit;try{const res=await fetch(event.request);if(res.ok||res.type==='opaque'){cache.put(event.request,res.clone());trimCache(TILE_CACHE,2200);}return res;}catch(e){return new Response('',{status:503,statusText:'Offline tile unavailable'});}}));return;}
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request,{ignoreSearch:true}).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
        return response;
      });
      return cached || network.catch(() => new Response('',{status:503,statusText:'Offline asset unavailable'}));
    })
  );
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch(e){data={title:'BlockBoss CRM',body:event.data?.text()||'Follow-up due'};}
  event.waitUntil(self.registration.showNotification(data.title||'BlockBoss CRM',{body:data.body||'Follow-up due',tag:data.lead_id?'callback-'+data.lead_id:'blockboss',data:{url:data.url||'./',lead_id:data.lead_id||''},requireInteraction:true}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=event.notification.data?.url||'./';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list)if('focus'in c){c.navigate(url);return c.focus();}return clients.openWindow(url);}));
});
