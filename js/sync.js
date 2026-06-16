// ── Sync Status ───────────────────────────────────────────────────────────────
function setSyncDot(s) {
  const d = document.getElementById('syncDot');
  if (d) d.style.background = s==='ok' ? 'var(--green)' : s==='err' ? 'var(--red)' : 'var(--yellow)';
}

// ── Data Transform ────────────────────────────────────────────────────────────
function localToRemote(l) {
  const tid = session().team_id || l.team_id || '';
  return {
    local_id:l.id, team_id:tid, first:l.first||'', last:l.last||'', phone:l.phone||'', email:l.email||'',
    addr:l.addr||'', city:l.city||l.boro||'', boro:l.boro||'', zip:l.zip||'',
    lat:+l.lat||null, lng:+l.lng||null, status:l.status||'fresh', source:l.source||'manual',
    territory:l.territory||'', assigned_agent:l.assigned_agent||'',
    assigned_user_email:l.assigned_user_email||'', assigned_user_id:l.assigned_user_id||null,
    monthly_bill:String(l.monthly_bill||''), heating_bill:String(l.heating_bill||''),
    credit:l.credit||'', roof_notes:l.roof_notes||'', notes:l.notes||'',
    solar_status:l.solar_status||'unknown', heating_type:l.heating_type||'unknown',
    hvac_opportunity:l.hvac_opportunity||'', callback_due:l.callback_due||'',
    appt_time:l.appt_time||'', bbl:l.bbl||'', raw_data:l,
    updated_at:l.updated_at||new Date().toISOString()
  };
}
function remoteToLocal(row) {
  const raw = row.raw_data || {};
  return {
    ...raw, id:row.local_id, team_id:row.team_id,
    first:row.first||raw.first||'', last:row.last||raw.last||'',
    phone:row.phone||raw.phone||'', email:row.email||raw.email||'',
    addr:row.addr||raw.addr||'', boro:row.boro||raw.boro||'', zip:row.zip||raw.zip||'',
    lat:row.lat??raw.lat, lng:row.lng??raw.lng, status:row.status||raw.status||'fresh',
    source:row.source||raw.source||'manual', territory:row.territory||raw.territory||'',
    assigned_agent:row.assigned_agent||raw.assigned_agent||'',
    assigned_user_email:row.assigned_user_email||raw.assigned_user_email||'',
    monthly_bill:row.monthly_bill||raw.monthly_bill||'', notes:row.notes||raw.notes||'',
    solar_status:row.solar_status||raw.solar_status||'unknown',
    heating_type:row.heating_type||raw.heating_type||'unknown',
    bbl:row.bbl||raw.bbl||'', updated_at:row.updated_at||raw.updated_at
  };
}

// ── Full Sync (pull from Supabase) ────────────────────────────────────────────
async function syncFromSupabase() {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid) return;
  setSyncDot('busy');
  try {
    const { data, error } = await sb.from('leads').select('*').eq('team_id', tid).order('updated_at', { ascending:false }).limit(10000);
    if (error) throw error;
    if (data?.length) {
      const rm = {};
      data.forEach(r => { rm[r.local_id] = remoteToLocal(r); });
      const localOnly = state.leads.filter(l => !rm[l.id] && !l.team_id);
      state.leads = [...Object.values(rm), ...localOnly];
      saveState(); renderAll();
    }
    setSyncDot('ok');
  } catch(e) { setSyncDot('err'); console.warn('Sync:', e); }
}

async function syncBillingFromSupabase() {
  if (!sb || !session()?.email) return;
  try {
    const { data } = await sb.from('master_accounts').select('plan_key,plan_status,plan_expires_at,stripe_customer_id,stripe_subscription_id,email_verified,referral_code,referral_credits,logo_url,accent_color').eq('email', session().email.toLowerCase()).single();
    if (!data?.plan_key) return;
    saveBilling({
      plan_key:data.plan_key, status:data.plan_status||'active',
      period_end:data.plan_expires_at?.slice(0,10)||'',
      stripe_customer_id:data.stripe_customer_id||'',
      stripe_subscription_id:data.stripe_subscription_id||'',
      billing_email:session().email, email_verified:data.email_verified!==false,
      referral_code:data.referral_code||'', referral_credits:data.referral_credits||0,
      logo_url:data.logo_url||'', accent_color:data.accent_color||''
    });
    if (data.email_verified === false) showVerifyBanner();
    renderBrand(); renderStats();
  } catch(e) { console.warn('syncBilling:', e); }
}

// ── Offline Queue ─────────────────────────────────────────────────────────────
let offlineQueue = [];
try { offlineQueue = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch(e) {}
function saveQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue)); } catch(e) {} }
function queueLead(l) {
  const i = offlineQueue.findIndex(x => x.id === l.id);
  if (i >= 0) offlineQueue[i] = l; else offlineQueue.push(l);
  saveQueue(); setSyncDot('busy');
  const dot = document.getElementById('syncDot');
  if (dot) dot.title = offlineQueue.length + ' changes queued';
}
async function flushQueue() {
  if (!sb || !session().team_id || !offlineQueue.length) return;
  setSyncDot('busy');
  const q = [...offlineQueue]; offlineQueue = []; saveQueue();
  const failed = [];
  for (const l of q) {
    try { await sb.from('leads').upsert(localToRemote(l), { onConflict:'local_id' }); }
    catch(e) { failed.push(l); }
  }
  offlineQueue = failed; saveQueue();
  if (!failed.length) { toast('✓ ' + q.length + ' queued changes synced'); setSyncDot('ok'); }
  else setSyncDot('err');
}

// ── Upsert Helpers ────────────────────────────────────────────────────────────
async function upsertLead(l) {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid) return;
  if (!navigator.onLine) { queueLead(l); return; }
  const row = localToRemote(l);
  if (!row.local_id || !row.team_id) return;
  try { await sb.from('leads').upsert(row, { onConflict:'local_id' }); }
  catch(e) { queueLead(l); console.warn('Queued:', e); }
}
async function upsertBatch(leads) {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid || !navigator.onLine) return;
  const rows = leads.map(localToRemote).filter(r => r.local_id && r.team_id);
  for (let i = 0; i < rows.length; i += 200) {
    try { await sb.from('leads').upsert(rows.slice(i, i+200), { onConflict:'local_id' }); }
    catch(e) { console.warn('Batch:', e); }
  }
}
async function deleteLeadRemote(id) {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid) return;
  try { await sb.from('leads').delete().eq('local_id', id).eq('team_id', tid); }
  catch(e) { console.warn('Del:', e); }
}

// ── Realtime ──────────────────────────────────────────────────────────────────
function initRealtime() {
  if (!sb || !session().team_id) return;
  sb.channel('leads-' + session().team_id)
    .on('postgres_changes', { event:'*', schema:'public', table:'leads', filter:`team_id=eq.${session().team_id}` }, p => {
      if (!p.new?.local_id) return;
      const l = remoteToLocal(p.new), idx = state.leads.findIndex(x => x.id === l.id);
      if (p.eventType === 'DELETE') state.leads = state.leads.filter(x => x.id !== l.id);
      else if (idx >= 0) state.leads[idx] = l;
      else state.leads.push(l);
      saveState(); renderAll(); setSyncDot('ok');
      if (session().role === 'master' && p.new && p.new.status && p.new.assigned_agent && p.new.assigned_agent !== agentName() && Notification.permission === 'granted') {
        new Notification('BlockBoss CRM — Rep Update', {
          body: (p.new.assigned_agent||'Rep') + ' → ' + (p.new.status||'updated') + ': ' + (p.new.addr||p.new.first||'lead'),
          tag:'rep-'+p.new.local_id, icon:'/icon-192.png'
        });
      }
    }).subscribe();
}

// ── DB Lookup ─────────────────────────────────────────────────────────────────
async function sbLookup(email, pin, role) {
  if (!sb) return null;
  const table = role === 'agent' ? 'agent_accounts' : 'master_accounts';
  const { data, error } = await sb.from(table).select('*').ilike('email', email).eq('pin', pin).limit(1);
  if (error || !data?.length) return null;
  return data[0];
}

// ── Live Tracking ─────────────────────────────────────────────────────────────
function startTracking() {
  if (trackInterval) { stopTracking(); return; }
  broadcastLoc(); trackInterval = setInterval(broadcastLoc, 30000);
  subscribeLocations(); toast('📡 Live tracking ON');
}
function stopTracking() { clearInterval(trackInterval); trackInterval = null; toast('Tracking off'); }
async function broadcastLoc() {
  if (!sb || !session().team_id) return;
  navigator.geolocation?.getCurrentPosition(async p => {
    try {
      await sb.from('agent_locations').upsert({
        team_id:session().team_id, agent_name:agentName(),
        agent_email:session().email||agentName()+'@team',
        lat:p.coords.latitude, lng:p.coords.longitude, accuracy:p.coords.accuracy,
        updated_at:new Date().toISOString()
      }, { onConflict:'team_id,agent_email' });
    } catch(e) {}
  }, null, { enableHighAccuracy:true, timeout:8000 });
}
function subscribeLocations() {
  if (!sb || !session().team_id) return;
  sb.from('agent_locations').select('*').eq('team_id', session().team_id).then(({ data }) => { (data||[]).forEach(renderAgentDot); });
  sb.channel('locs-' + session().team_id)
    .on('postgres_changes', { event:'*', schema:'public', table:'agent_locations', filter:`team_id=eq.${session().team_id}` }, p => { if (p.new) renderAgentDot(p.new); })
    .subscribe();
}
function renderAgentDot(loc) {
  const key = loc.agent_email || loc.agent_name;
  const age = (Date.now() - new Date(loc.updated_at)) / 60000;
  if (age > 10) { if (agentDots[key]) { map.removeLayer(agentDots[key]); delete agentDots[key]; } return; }
  const c = agentColor(loc.agent_name), init = (loc.agent_name||'?')[0].toUpperCase();
  const html = `<div style="background:${c};width:20px;height:20px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;color:#07111d">${init}</div>`;
  const icon = L.divIcon({ className:'', html, iconSize:[20,20], iconAnchor:[10,10] });
  if (agentDots[key]) { agentDots[key].setLatLng([loc.lat, loc.lng]).setIcon(icon); }
  else { agentDots[key] = L.marker([loc.lat, loc.lng], { icon, zIndexOffset:500 }).addTo(map).bindPopup(`<b>${esc(loc.agent_name)}</b><br>${age<1?'just now':Math.round(age)+'m ago'}`); }
}
