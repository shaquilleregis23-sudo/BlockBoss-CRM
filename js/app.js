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
map.on('moveend',()=>{clearTimeout(_viewportRenderTimer);_viewportRenderTimer=setTimeout(renderMarkers,220);});
updateLabelViz();

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
  if (session().team_id) { await syncFromSupabase(); syncBillingFromSupabase(); initRealtime(); subscribeLocations(); flushQueue(); }
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

// ?billing_success=solo|team|agency  +  ?ref=CODE — Stripe redirect
(() => {
  const params = new URLSearchParams(location.search);
  const pk = params.get('billing_success');
  const _refParam = params.get('ref');
  if (_refParam) localStorage.setItem('m2_ref', _refParam.toUpperCase());
  if (pk && STRIPE_PLANS[pk]) {
    saveBilling({ plan_key:pk, status:'active', period_end:new Date(Date.now()+30*86400000).toISOString().slice(0,10) });
    history.replaceState({}, '', location.pathname);
    renderBrand(); renderStats();
    setTimeout(() => {
      toast('🎉 Subscription activated — ' + STRIPE_PLANS[pk].label + ' plan is live!');
      if (!session()?.role) setTimeout(() => { openLogin(); toast('Log in with your email and PIN to get started'); }, 1400);
    }, 600);
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
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#161b22;border-top:2px solid rgba(88,166,255,.3);padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:99999;box-shadow:0 -4px 24px rgba(0,0,0,.5)';
  d.innerHTML = '<div style="flex:1"><b style="font-size:13px">Add BlockBoss CRM to Home Screen</b><br><span style="font-size:11px;color:#8b949e">Works offline · Full screen · Instant access</span></div><button onclick="installApp()" style="background:#238636;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer">+ Install</button><button onclick="localStorage.setItem(\'m2_pwa_dismissed\',\'1\');document.getElementById(\'installBanner\').remove()" style="background:transparent;color:#8b949e;border:none;cursor:pointer;font-size:22px;padding:0 4px">×</button>';
  document.body.appendChild(d);
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
