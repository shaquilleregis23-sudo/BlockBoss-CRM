// ── Sync Status ───────────────────────────────────────────────────────────────
function setSyncDot(s) {
  const d = document.getElementById('syncDot');
  if (d) {
    d.style.background = s==='ok' ? 'var(--green)' : s==='err' ? 'var(--red)' : 'var(--yellow)';
    d.title = s==='ok' ? `Cloud synced ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : s==='err' ? 'Cloud sync needs attention' : 'Cloud sync in progress';
  }
  updateOfflineUI();
}

function updateOfflineUI() {
  const bar=document.getElementById('offlineBar'),txt=document.getElementById('offlineText'),btn=document.getElementById('retrySync');
  if(!bar||!txt)return;
  const pending=offlineQueue?.length||0,offline=!navigator.onLine;
  bar.classList.toggle('open',offline||pending>0);bar.classList.toggle('online',!offline&&pending>0);
  txt.textContent=offline?(pending?`Offline · ${pending} change${pending===1?'':'s'} saved`:'Offline field mode · saves stay on this phone'):`Online · syncing ${pending} change${pending===1?'':'s'}`;
  if(btn){btn.style.display=offline?'none':'';btn.textContent='Sync now';}
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
function syncTime(l) { const t=new Date(l?.updated_at||0).getTime(); return Number.isFinite(t)?t:0; }
function markLeadSync(l,status,error='') {
  if(!l)return; l._sync_status=status; l._sync_error=error ? String(error).slice(0,180) : ''; l._sync_checked_at=new Date().toISOString();
}
function syncBadgeHTML(l) {
  const s=l?._sync_status||(!session().team_id?'local':'pending');
  const map={synced:['✓ Cloud','hot'],syncing:['↻ Syncing','blue'],queued:['☁ Queued','gold'],error:['! Sync','red'],pending:['• Pending','gold'],local:['Local','']};
  const [label,cls]=map[s]||map.pending;
  return `<span class="badge ${cls}" title="${esc(l?._sync_error||'')}">${label}</span>`;
}
function newerLead(a,b) {
  if(!a)return b; if(!b)return a;
  if(syncTime(a)===syncTime(b)) return b._sync_status==='synced'?b:a;
  return syncTime(a)>syncTime(b)?a:b;
}
function dedupeLeadArray(rows) {
  const byId=new Map(), byIdentity=new Map();
  for(const l of rows||[]){
    if(!l?.id)continue; const prior=byId.get(l.id); byId.set(l.id,newerLead(prior,l));
  }
  for(const l of byId.values()){
    const key=leadIdentityKey(l); if(key==='addr::')continue;
    const prior=byIdentity.get(key);
    if(!prior)byIdentity.set(key,l);
    else {
      const preferred=(prior.status!=='fresh'&&l.status==='fresh')?prior:(l.status!=='fresh'&&prior.status==='fresh')?l:newerLead(prior,l);
      const dropped=preferred===prior?l:prior; preferred.notes=[preferred.notes,dropped.notes].filter(Boolean).join('\n');
      byIdentity.set(key,preferred); byId.delete(dropped.id);
    }
  }
  return [...byId.values()];
}

// ── Full Sync (pull from Supabase) ────────────────────────────────────────────
async function syncFromSupabase() {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid) return;
  setSyncDot('busy');
  try {
    const data=[]; const pageSize=1000;
    for(let from=0;from<100000;from+=pageSize){
      const { data:page,error }=await sb.from('leads').select('*').eq('team_id',tid).order('updated_at',{ascending:false}).range(from,from+pageSize-1);
      if(error)throw error; data.push(...(page||[]));
      if(!page||page.length<pageSize)break;
    }
    if (data) {
      const merged=new Map((state.leads||[]).map(l=>[l.id,l]));
      data.forEach(r=>{const remote=remoteToLocal(r),local=merged.get(remote.id);markLeadSync(remote,'synced');const winner=newerLead(local,remote);merged.set(remote.id,winner);if(winner===local&&syncTime(local)>syncTime(remote))queueLead(local,'Local edit is newer than cloud');});
      state.leads=dedupeLeadArray([...merged.values()]); saveState(); renderAll();
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
function saveQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue)); } catch(e) {} updateOfflineUI(); }
function queueLead(l,error='') {
  if(!l?.id)return;
  markLeadSync(l,'queued',error);
  const item={type:'upsert',id:l.id,lead:{...l},attempts:0,queued_at:new Date().toISOString(),last_error:String(error||'')};
  const i = offlineQueue.findIndex(x => (x.id||x.lead?.id) === l.id);
  if (i >= 0) offlineQueue[i] = {...item,attempts:(offlineQueue[i].attempts||0)}; else offlineQueue.push(item);
  saveQueue(); setSyncDot('busy');
  const dot = document.getElementById('syncDot');
  if (dot) dot.title = offlineQueue.length + ' changes queued';
}
function queueDelete(id,error=''){
  if(!id)return;const item={type:'delete',id,attempts:0,queued_at:new Date().toISOString(),last_error:String(error||'')};
  const i=offlineQueue.findIndex(x=>x.id===id);if(i>=0)offlineQueue[i]=item;else offlineQueue.push(item);saveQueue();setSyncDot('busy');
}
async function flushQueue() {
  if (!sb || !session().team_id || !offlineQueue.length || !navigator.onLine) { updateOfflineUI(); return; }
  setSyncDot('busy');
  const q = [...offlineQueue]; offlineQueue = []; saveQueue();
  const failed = [];
  const deletes=q.filter(x=>x.type==='delete'),upserts=q.filter(x=>x.type!=='delete');
  for(let i=0;i<upserts.length;i+=100){
    const batch=upserts.slice(i,i+100);
    try {
      const {error}=await sb.from('leads').upsert(batch.map(x=>localToRemote(x.lead||x)),{onConflict:'local_id'});
      if(error)throw error;batch.forEach(x=>markLeadSync(state.leads.find(l=>l.id===x.id),'synced'));
    }
    catch(e){batch.forEach(x=>failed.push({...x,attempts:(x.attempts||0)+1,last_error:e.message||String(e)}));}
  }
  for(const item of deletes){
    try{const {error}=await sb.from('leads').delete().eq('local_id',item.id).eq('team_id',session().team_id);if(error)throw error;}
    catch(e){failed.push({...item,attempts:(item.attempts||0)+1,last_error:e.message||String(e)});}
  }
  offlineQueue = failed; saveQueue();
  saveState();
  if (!failed.length) { toast('✓ ' + q.length + ' offline change' + (q.length===1?'':'s') + ' synced'); setSyncDot('ok'); }
  else {toast(`${failed.length} change${failed.length===1?'':'s'} still waiting`);setSyncDot('err');}
}

// ── Upsert Helpers ────────────────────────────────────────────────────────────
async function upsertLead(l) {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid) return;
  if (!navigator.onLine) { queueLead(l); return; }
  const row = localToRemote(l);
  if (!row.local_id || !row.team_id) return;
  markLeadSync(l,'syncing'); setSyncDot('busy');
  try {
    const { error }=await sb.from('leads').upsert(row, { onConflict:'local_id' });
    if(error)throw error; markLeadSync(l,'synced'); saveState(); setSyncDot('ok');
  }
  catch(e) { queueLead(l,e.message||e); console.warn('Queued:', e); }
}
async function upsertBatch(leads) {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid || !navigator.onLine) return;
  const rows = leads.map(localToRemote).filter(r => r.local_id && r.team_id);
  for (let i = 0; i < rows.length; i += 200) {
    const batch=rows.slice(i,i+200);
    try {
      const { error }=await sb.from('leads').upsert(batch, { onConflict:'local_id' });
      if(error)throw error; batch.forEach(r=>markLeadSync(state.leads.find(l=>l.id===r.local_id),'synced'));
    }
    catch(e) { batch.forEach(r=>{const l=state.leads.find(x=>x.id===r.local_id);if(l)queueLead(l,e.message||e);}); console.warn('Batch:', e); }
  }
}
async function deleteLeadRemote(id) {
  if (!sb) return;
  const tid = session().team_id;
  if (!tid) return;
  if(!navigator.onLine){queueDelete(id);return;}
  try { const { error }=await sb.from('leads').delete().eq('local_id', id).eq('team_id', tid); if(error)throw error; }
  catch(e) { queueDelete(id,e.message||e);console.warn('Del queued:', e); }
}

// ── Realtime ──────────────────────────────────────────────────────────────────
let leadRealtimeChannel=null, locationRealtimeChannel=null;
function initRealtime() {
  if (!sb || !session().team_id) return;
  if(leadRealtimeChannel)sb.removeChannel(leadRealtimeChannel);
  leadRealtimeChannel=sb.channel('leads-' + session().team_id)
    .on('postgres_changes', { event:'*', schema:'public', table:'leads', filter:`team_id=eq.${session().team_id}` }, p => {
      const row=p.eventType==='DELETE'?p.old:p.new;
      if (!row?.local_id) { if(p.eventType==='DELETE')syncFromSupabase(); return; }
      const l = remoteToLocal(row), idx = state.leads.findIndex(x => x.id === l.id);
      if (p.eventType === 'DELETE') state.leads = state.leads.filter(x => x.id !== l.id);
      else if (idx >= 0) {
        const local=state.leads[idx];
        if(syncTime(local)>syncTime(l)&&local._sync_status!=='synced')queueLead(local,'Realtime conflict: local edit retained');
        else {markLeadSync(l,'synced');state.leads[idx]=l;}
      }
      else {markLeadSync(l,'synced');state.leads.push(l);}
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
      const { error }=await sb.from('agent_locations').upsert({
        team_id:session().team_id, agent_name:agentName(),
        agent_email:session().email||agentName()+'@team',
        lat:p.coords.latitude, lng:p.coords.longitude, accuracy:p.coords.accuracy,
        updated_at:new Date().toISOString()
      }, { onConflict:'team_id,agent_email' });
      if(error)throw error;
    } catch(e) { setSyncDot('err'); }
  }, null, { enableHighAccuracy:true, timeout:8000 });
}
function subscribeLocations() {
  if (!sb || !session().team_id) return;
  sb.from('agent_locations').select('*').eq('team_id', session().team_id).then(({ data }) => { (data||[]).forEach(renderAgentDot); });
  if(locationRealtimeChannel)sb.removeChannel(locationRealtimeChannel);
  locationRealtimeChannel=sb.channel('locs-' + session().team_id)
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
