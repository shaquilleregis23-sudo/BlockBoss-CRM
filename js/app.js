// ── Event Listeners & Init ────────────────────────────────────────────────────
const pushOpenLeadId=new URLSearchParams(location.search).get('open_lead');
document.addEventListener('click', parseAction, true);
window.addEventListener('error',e=>logHealth('error','javascript',e.message||'JavaScript error',{file:e.filename,line:e.lineno,column:e.colno}));
window.addEventListener('unhandledrejection',e=>logHealth('error','promise',e.reason?.message||String(e.reason||'Unhandled promise rejection')));

// Keep sheets and modals fitted to the visible iPhone viewport when Safari's
// address bar or software keyboard changes the usable screen height.
function syncVisibleViewport() {
  const h = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
  if (typeof map !== 'undefined') requestAnimationFrame(() => map.invalidateSize({ pan:false }));
}
syncVisibleViewport();
window.addEventListener('resize', syncVisibleViewport, { passive:true });
window.addEventListener('orientationchange', () => setTimeout(syncVisibleViewport, 150), { passive:true });
window.visualViewport?.addEventListener('resize', syncVisibleViewport, { passive:true });
window.visualViewport?.addEventListener('scroll', syncVisibleViewport, { passive:true });

// One-hand gesture: pull the lead sheet down from its header to close it.
let sheetTouchY=0,sheetTouchX=0;
const leadSheet=document.getElementById('sheet');
leadSheet.addEventListener('touchstart',e=>{const t=e.touches[0];sheetTouchY=t.clientY;sheetTouchX=t.clientX;},{passive:true});
leadSheet.addEventListener('touchend',e=>{const t=e.changedTouches[0],dy=t.clientY-sheetTouchY,dx=Math.abs(t.clientX-sheetTouchX);if(dy>85&&dx<70&&(e.target.closest('.sheet-header,.sheet-handle')||leadSheet.scrollTop<8)){navigator.vibrate?.(12);closeSheet();}},{passive:true});

document.getElementById('filterToggle').onclick = e => { e.stopPropagation(); document.getElementById('filterBar').classList.toggle('open'); };
document.getElementById('openLeadSearch').onclick = openLeadSearch;
document.getElementById('fieldToggle').onclick  = e => { e.stopPropagation(); document.getElementById('fieldMenu').classList.toggle('open'); };
document.addEventListener('click', e => {
  if (!e.target.closest('#fieldMenu,#fieldToggle')) document.getElementById('fieldMenu').classList.remove('open');
  if (!e.target.closest('#filterBar,#filterToggle')) document.getElementById('filterBar').classList.remove('open');
});

document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => switchView(b.dataset.view));

document.getElementById('closeSheet').onclick   = closeSheet;
document.getElementById('sheetHandle').onclick  = closeSheet;
document.getElementById('nextBestPill').onclick = () => goLead(nextBestLead());
document.getElementById('openLogin').onclick    = openLogin;
document.getElementById('openLaunch').onclick   = launch;
document.getElementById('exportTop').onclick    = exportBackup;
document.getElementById('cancelLoad').onclick   = () => loadCancelled = true;
const retrySyncBtn=document.getElementById('retrySync');
if(retrySyncBtn)retrySyncBtn.onclick=()=>{if(!navigator.onLine)return toast('Still offline');flushQueue();};
window.addEventListener('offline',()=>{updateOfflineUI();toast('Offline mode — changes stay safe on this phone');});
window.addEventListener('online',()=>{updateOfflineUI();toast('Back online — syncing changes');flushQueue();});

document.addEventListener('change', e => {
  if (e.target.id === 'backupFile') importBackup(e.target.files[0]);
  if (e.target.id === 'csvFile')    importCSV(e.target.files[0]);
});
let leadSearchTimer;
document.addEventListener('input',e=>{if(e.target.id!=='leadSearchInput')return;clearTimeout(leadSearchTimer);leadSearchTimer=setTimeout(()=>runLeadSearch(e.target.value),100);});

// ── Map Interactions ──────────────────────────────────────────────────────────
map.on('click', e => {
  if (draftMarker) draftMarker.remove();
  draftMarker = L.marker(e.latlng, {
    icon: L.divIcon({ className:'', html:`<div class="dot-pin dot-cold dot-selected"></div>`, iconSize:[34,34], iconAnchor:[17,17] })
  }).addTo(map).bindPopup('<b>New lead location</b><br><button onclick="window._openCreateFromDraft()">Add lead here</button>').openPopup();
  window._draftLatLng = e.latlng;
});
window._openCreateFromDraft = () => openCreate(window._draftLatLng);

function updateLabelViz() { document.getElementById('map').classList.toggle('show-prop-labels', map.getZoom() >= 17); }
map.on('zoomend', updateLabelViz);
let _viewportRenderTimer=null;
let _parcelRenderTimer=null;
map.on('moveend',()=>{clearTimeout(_viewportRenderTimer);_viewportRenderTimer=setTimeout(renderMarkers,220);clearTimeout(_parcelRenderTimer);_parcelRenderTimer=setTimeout(loadParcelBoundaries,360);});
updateLabelViz();
loadParcelBoundaries();

// ── Initial Render & Sync ─────────────────────────────────────────────────────
renderAll();
updateOfflineUI();
scheduleCallbackNotifs();
setInterval(checkDueCallbacks,30000);
(async()=>{
  const restored = typeof hydrateLeadsFromIndexedDB === 'function' ? await hydrateLeadsFromIndexedDB() : 0;
  if (restored) renderAll();
  await initSecureAuth();
  if (!state.leads.length) info('Tap Field Tools → Neighborhoods or Load Area to load NYC owner-name sun pins.');
  if (session().team_id) { await syncFromSupabase(); await syncBillingFromSupabase(); initRealtime(); subscribeLocations(); flushQueue(); refreshActivationState(); }
  if(pushOpenLeadId){history.replaceState({},'',location.pathname);setTimeout(()=>{const l=state.leads.find(x=>x.id===pushOpenLeadId);if(l)goLead(l);else toast('Callback lead is not assigned to this login');},350);}
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ── URL Param Handlers ────────────────────────────────────────────────────────

// ?verified=1 — email verified redirect
(() => {
  const vf = new URLSearchParams(location.search).get('verified');
  if (vf) {
    history.replaceState({}, '', location.pathname);
    localStorage.setItem('m2_verified', '1');
    setTimeout(() => toast('✅ Email verified — you\'re all set!'), 400);
  }
})();

// ?invite_token=UUID — agent invite link
(() => {
  const it = new URLSearchParams(location.search).get('invite_token');
  if (it) { history.replaceState({}, '', location.pathname); setTimeout(() => showAcceptInvite(it), 500); }
})();

// Supabase secure agent invite redirect.
(() => {
  if(new URLSearchParams(location.search).get('agent_invite'))setTimeout(showSecureAgentInvite,900);
})();

// ?plan=solo|team|agency — pricing CTA
(() => {
  const pp = new URLSearchParams(location.search).get('plan');
  if (!pp || !STRIPE_PLANS[pp]) return;
  history.replaceState({}, '', location.pathname);
  window._suPlan = pp;
  if (session() && session().role) {
    setTimeout(() => openBilling(), 400);
  } else {
    setTimeout(() => {
      openLogin();
      window._suPlan = pp;
      setTimeout(() => {
        const bt = document.querySelector('[data-login-role="signup"]');
        if (bt) bt.click();
        setTimeout(() => { const el = document.querySelector('[data-su-plan="'+pp+'"]'); if (el) el.click(); }, 80);
      }, 250);
    }, 400);
  }
})();

// Stripe redirects never grant access by themselves. The server-side account
// record must confirm the subscription before the CRM treats it as active.
(() => {
  const params = new URLSearchParams(location.search);
  const pk = params.get('billing_success');
  const _refParam = params.get('ref');
  if (_refParam) localStorage.setItem('m2_ref', _refParam.toUpperCase());
  if (pk && STRIPE_PLANS[pk]) {
    history.replaceState({}, '', location.pathname);
    setTimeout(async()=>{await syncBillingFromSupabase();if(billingActive())toast('🎉 Subscription confirmed — '+billingPlan().label+' is live!');else toast('Payment received · sign in to confirm your plan');},600);
  }
})();

// ── PWA Install Banner ────────────────────────────────────────────────────────
var _installPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _installPrompt = e;
  if (!window.matchMedia('(display-mode: standalone)').matches && !localStorage.getItem('m2_pwa_dismissed')) {
    setTimeout(showInstallBanner, 5000);
  }
});

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;
  var d = document.createElement('div');
  d.id = 'installBanner';
  // Sits ABOVE the bottom nav, not on top of it. At bottom:0 / z-index:99999 this
  // banner covered the Map/Leads/Stats buttons and ate every tap on them.
  d.style.cssText = 'position:fixed;bottom:calc(62px + env(safe-area-inset-bottom,0px));left:8px;right:8px;background:#161b22;border:1px solid rgba(88,166,255,.3);border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;z-index:1250;box-shadow:0 -4px 24px rgba(0,0,0,.5)';
  d.innerHTML = '<div style="flex:1"><b style="font-size:13px">Add BlockBoss CRM to Home Screen</b><br><span style="font-size:11px;color:#8b949e">Works offline · Full screen · Instant access</span></div><button onclick="installApp()" style="background:#238636;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer">+ Install</button><button onclick="localStorage.setItem(\'m2_pwa_dismissed\',\'1\');document.getElementById(\'installBanner\').remove()" style="background:transparent;color:#8b949e;border:none;cursor:pointer;font-size:22px;padding:0 4px">×</button>';
  document.body.appendChild(d);
  setTimeout(function(){ var b=document.getElementById('installBanner'); if(b) b.remove(); }, 20000);
}

async function installApp() {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  const r = await _installPrompt.userChoice;
  _installPrompt = null;
  const b = document.getElementById('installBanner');
  if (b) b.remove();
  if (r.outcome === 'accepted') { localStorage.setItem('m2_pwa_dismissed', '1'); toast('✓ BlockBoss CRM added to home screen'); }
}

window.addEventListener('appinstalled', function() {
  const b = document.getElementById('installBanner');
  if (b) b.remove();
});

// Vendor tools (BlockBoss owner only) — hidden for every customer by default.
// Turn on for yourself with ?vendor=1 on the URL; ?vendor=0 turns it off again.
(function(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.has('vendor')) localStorage.setItem('bb_vendor', q.get('vendor')==='1'?'1':'0');
  }catch(e){}
  const apply=()=>document.body.classList.toggle('vendor-on', typeof isVendor==='function' && isVendor());
  if(document.body) apply(); else document.addEventListener('DOMContentLoaded',apply);
})();

// ── Error monitoring ──────────────────────────────────────────────────────────
// Routed through PostHog (already loaded) so breakage surfaces without standing up
// another service. Swap in a Sentry DSN later if you want stack-trace grouping.
(function(){
  let sent = 0;
  const report = (kind, msg, extra) => {
    if (sent >= 15) return;            // never spam a rep's connection
    sent++;
    try {
      if (window.posthog) posthog.capture('app_error', {
        kind, message: String(msg || '').slice(0, 300),
        where: (location.pathname + location.hash).slice(0, 120),
        online: navigator.onLine, release: 'v21-nyc-polish', ...extra
      });
    } catch(e) {}
  };
  window.addEventListener('error', e => report('js', e.message, {
    src: String(e.filename || '').split('/').pop(), line: e.lineno
  }));
  window.addEventListener('unhandledrejection', e => report('promise', e.reason && (e.reason.message || e.reason)));
})();

// ── Haptics ───────────────────────────────────────────────────────────────────
// A short tick when a rep taps a disposition. Costs nothing, makes the app feel
// native in the hand instead of like a web page.
(function(){
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-disp], .qd-btn, .save-btn, .nav-btn');
    if (!t) return;
    try { if (navigator.vibrate) navigator.vibrate(12); } catch(err) {}
  }, true);
})();

// ── Self-healing upgrades ─────────────────────────────────────────────────────
// A PWA that ships a new build can leave a phone running the OLD service worker
// with a half-stale cache — old JS against new HTML, which shows up as a black
// map and dead taps. On a version change we purge caches, drop old workers and
// reload exactly once (sessionStorage guards against a reload loop).
(function(){
  var BUILD = 'v25-usable';
  var KEY = 'bb_build', GUARD = 'bb_healed';
  try {
    var prev = localStorage.getItem(KEY);
    if (prev === BUILD) return;                       // already on this build
    if (!prev) { localStorage.setItem(KEY, BUILD); return; }  // first ever run
    if (sessionStorage.getItem(GUARD) === BUILD) {    // healed already this session
      localStorage.setItem(KEY, BUILD); return;
    }
    sessionStorage.setItem(GUARD, BUILD);
    Promise.resolve()
      .then(function(){ return window.caches ? caches.keys().then(function(ks){
        return Promise.all(ks.map(function(k){ return caches.delete(k); })); }) : null; })
      .then(function(){ return navigator.serviceWorker ?
        navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){ return r.unregister(); })); }) : null; })
      .catch(function(){})
      .then(function(){ localStorage.setItem(KEY, BUILD); location.reload(); });
  } catch(e) {}
})();

// Escape hatch: <url>?reset=1 force-clears everything on any device.
(function(){
  try{
    if(new URLSearchParams(location.search).get('reset')!=='1') return;
    Promise.resolve()
      .then(function(){ return window.caches ? caches.keys().then(function(ks){
        return Promise.all(ks.map(function(k){ return caches.delete(k); })); }) : null; })
      .then(function(){ return navigator.serviceWorker ?
        navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){ return r.unregister(); })); }) : null; })
      .catch(function(){})
      .then(function(){ location.replace(location.pathname); });
  }catch(e){}
})();

// ── Tab wake-up ───────────────────────────────────────────────────────────────
// Chrome can freeze or discard a backgrounded tab. On return the map often has a
// stale size and half-drawn tiles, which looks like a dead app. Nudge it awake.
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState !== 'visible') return;
  try {
    if (typeof map === 'undefined' || !map) return;
    map.invalidateSize();
    map.eachLayer(function(l){ if (l && typeof l.redraw === 'function' && l._url) l.redraw(); });
  } catch(e) {}
});

// ── Map watchdog ──────────────────────────────────────────────────────────────
// The map is the product; if it doesn't paint, the app looks dead. Chrome can
// throttle or freeze a tab (Memory Saver, background, bfcache restore), which
// leaves Leaflet with a stale size and tiles that never got drawn. Rather than
// trusting one init pass, re-assert the map a few times early and on every wake.
(function(){
  function kick(){
    try{
      if (typeof map === 'undefined' || !map) return;
      map.invalidateSize({ animate:false });
      var tileLayers = 0;
      map.eachLayer(function(l){ if (l && l._url && typeof l.redraw === 'function'){ tileLayers++; } });
      // No tiles in the DOM after the map has had time to settle => force a redraw.
      if (!document.querySelector('.leaflet-tile')) {
        map.eachLayer(function(l){ if (l && l._url && typeof l.redraw === 'function') l.redraw(); });
      }
      // Any loaded tile left invisible (throttled fade) gets forced opaque.
      var stuck = document.querySelectorAll('.leaflet-tile-loaded');
      for (var i=0;i<stuck.length;i++){
        if (stuck[i].style.opacity === '0' || getComputedStyle(stuck[i]).opacity === '0') stuck[i].style.opacity = '1';
      }
    }catch(e){}
  }
  [300, 1200, 3000, 6000].forEach(function(ms){ setTimeout(kick, ms); });
  window.addEventListener('pageshow', kick);       // bfcache restore
  window.addEventListener('focus', kick);
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible') kick();
  });
})();
