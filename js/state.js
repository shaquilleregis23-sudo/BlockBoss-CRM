// ── Core State ────────────────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { leads:[], filter:'all' }; }
  catch(e) { return { leads:[], filter:'all' }; }
}
function saveState() {
  if (typeof scheduleLeadPersistence === 'function') scheduleLeadPersistence(state.leads);
  try {
    const json = JSON.stringify(state);
    // IndexedDB is the durable large-territory store. Keep localStorage as the
    // fast bootstrap only while it remains comfortably below Safari's quota.
    if (json.length > 3200000) {
      const bootstrap = { ...state, leads:state.leads.filter(l => l.source==='manual' || l.source==='imported' || (l.status && l.status!=='fresh')).slice(-1200), idb_backed:true };
      localStorage.setItem(STORE, JSON.stringify(bootstrap));
    } else localStorage.setItem(STORE, json);
  }
  catch(e) {
    // localStorage full — trim PLUTO-fresh leads to save space
    const slim = { ...state, leads: state.leads.filter(l => l.source==='manual' || l.source==='imported' || (l.status && l.status!=='fresh')) };
    try { localStorage.setItem(STORE, JSON.stringify(slim)); } catch(e2) {}
    console.warn('localStorage full — PLUTO data lives in Supabase');
  }
}

let state = loadState();
let markers = {}, draftMarker = null, loadCancelled = false, currentLeadId = null, satellite = false;

// ── localStorage Helpers ──────────────────────────────────────────────────────
function settings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS)) || { company:'BlockBoss CRM', agent_name:'Shaquille', territory:'Queens / Long Island', door_goal:25, appt_goal:2, plan:'Growth', include_llc:true, allow_verify:true }; }
  catch(e) { return {}; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS, JSON.stringify({ ...settings(), ...s })); renderBrand(); }

function account() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT)) || { master_name:'Shaquille', master_email:'', master_pin:'', agents:[] }; }
  catch(e) { return { agents:[] }; }
}
function saveAccount(a) { localStorage.setItem(ACCOUNT, JSON.stringify(a)); }

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION)) || { role:'master', name: settings().agent_name || 'Shaquille' }; }
  catch(e) { return { role:'master', name:'Shaquille' }; }
}
function saveSession(s) { localStorage.setItem(SESSION, JSON.stringify(s)); renderBrand(); renderAll(); }

function contact() {
  try { return JSON.parse(localStorage.getItem(CONTACT)) || { name:'Shaquille Regis', email:'shaquilleregis23@gmail.com', phone:'', booking:'', cta:'DM CRM for a demo' }; }
  catch(e) { return {}; }
}
function saveContact(c) { localStorage.setItem(CONTACT, JSON.stringify(c)); }

function checks() { try { return JSON.parse(localStorage.getItem(CHECKS)) || {}; } catch(e) { return {}; } }
function saveChecks(c) { localStorage.setItem(CHECKS, JSON.stringify(c)); }

function subs() { try { return JSON.parse(localStorage.getItem(SUBS)) || []; } catch(e) { return []; } }
function saveSubs(s) { localStorage.setItem(SUBS, JSON.stringify(s)); }

function getBilling() { try { return JSON.parse(localStorage.getItem(BILLING_KEY)) || {}; } catch(e) { return {}; } }
function saveBilling(d) { try { localStorage.setItem(BILLING_KEY, JSON.stringify({ ...getBilling(), ...d })); } catch(e) {} }

function getOb() { try { return JSON.parse(localStorage.getItem(OB_KEY)) || {}; } catch(e) { return {}; } }
function saveOb(d) { try { localStorage.setItem(OB_KEY, JSON.stringify({ ...getOb(), ...d })); } catch(e) {} }

// ── Billing Helpers ───────────────────────────────────────────────────────────
function billingPlan() { const b = getBilling(); return STRIPE_PLANS[b.plan_key] || null; }
function billingActive() {
  const b = getBilling();
  if (!b.plan_key) return false;
  if (b.status === 'active') return true;
  if (b.status === 'trial' && b.trial_end && new Date(b.trial_end) > new Date()) return true;
  return false;
}

// ── Session Helpers ───────────────────────────────────────────────────────────
function role() { return session().role || 'master'; }
function isMaster() { return role() !== 'agent'; }
function agentName() { return session().name || settings().agent_name || 'Shaquille'; }

// ── Utility Helpers ───────────────────────────────────────────────────────────
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(window._t); window._t = setTimeout(() => t.classList.remove('show'), 2200); }
function info(msg) { document.getElementById('infoTag').textContent = msg; }
function val(id) { return document.getElementById(id)?.value || ''; }
function digits(v) { return String(v || '').replace(/\D/g, ''); }
function normalizeAddress(v) {
  return String(v || '').toUpperCase().trim()
    .replace(/,.*$/,'')
    .replace(/\b(QUEENS|BROOKLYN|BRONX|MANHATTAN|STATEN ISLAND|NEW YORK)\b\s*,?\s*NY\s*\d{5}(?:-\d{4})?$/,'')
    .replace(/\b(STREET|ST)\b/g,'ST').replace(/\b(AVENUE|AVE)\b/g,'AVE')
    .replace(/\b(BOULEVARD|BLVD)\b/g,'BLVD').replace(/\b(ROAD|RD)\b/g,'RD')
    .replace(/\b(PLACE|PL)\b/g,'PL').replace(/\b(COURT|CT)\b/g,'CT')
    .replace(/[^A-Z0-9]/g,'');
}
function leadIdentityKey(l) {
  if (l?.bbl) return `bbl:${String(l.bbl).replace(/\D/g,'')}`;
  return `addr:${normalizeAddress(l?.addr)}:${String(l?.zip||'').replace(/\D/g,'').slice(0,5)}`;
}
function localDT(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return v;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function copyText(t, msg='Copied') { navigator.clipboard?.writeText(t).then(() => toast('✓ ' + msg)).catch(() => prompt('Copy:', t)); }
function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 700);
}
