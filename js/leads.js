// ── Lead Scoring ──────────────────────────────────────────────────────────────
function sunScore(l) {
  if (l.sun_score !== undefined && l.sun_score !== '') return Math.max(0, Math.min(100, Math.round(+l.sun_score || 0)));
  let s = 42, r = [];
  if ((l.solar_status || '').includes('has')) s -= 35;
  else { s += 14; r.push('no solar noted'); }
  if ((l.bldg_class || '').startsWith('A')) s += 12;
  if ((l.bldg_class || '').startsWith('B')) s += 9;
  if (+l.monthly_bill >= 250) s += 13;
  else if (+l.monthly_bill >= 150) s += 9;
  if (+l.units > 0 && +l.units <= 2) s += 6;
  if (String(l.roof_notes || l.notes || '').match(/good|new|flat|sun|clear/i)) s += 12;
  if (String(l.roof_notes || l.notes || '').match(/shade|tree|bad|old|repair/i)) s -= 18;
  if (['interested','callback','set','sat'].includes(l.status)) s += 8;
  if (['not_qualified','do_not_knock','not_interested'].includes(l.status)) s -= 25;
  if (l.nrel_ghi) {
    const g = +l.nrel_ghi;
    if (g >= 4.5) s += 12; else if (g >= 4.3) s += 7; else if (g >= 4.0) s += 3; else s -= 5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

function leadQuality(l) {
  let q = 25 + Math.round(sunScore(l) * .35);
  if (+l.monthly_bill >= 180) q += 15;
  if (['interested','callback','set','sat'].includes(l.status)) q += 18;
  if ((l.solar_status || '').includes('no')) q += 10;
  if (String(l.heating_type || '').match(/oil|gas|boiler/i)) q += 8;
  if (String(l.hvac_opportunity || '').match(/mini|boiler|heat|window|comfort/i)) q += 8;
  if (['closed','not_interested','do_not_knock','not_qualified'].includes(l.status)) q -= 80;
  return Math.max(0, Math.min(100, q));
}

// ── Lead Display Helpers ──────────────────────────────────────────────────────
function markerClass(l) {
  const q = leadQuality(l), sel = currentLeadId === l.id ? ' dot-selected' : '';
  if (['do_not_knock','not_qualified','not_interested'].includes(l.status)) return 'dot-lost' + sel;
  if (l.status === 'closed') return 'dot-closed' + sel;
  if (q >= 70) return 'dot-hot' + sel;
  if (q >= 45) return 'dot-warm' + sel;
  return 'dot-cold' + sel;
}
function addrBadge(addr) {
  const m = String(addr || '').match(/^(\d+(?:-\d+)?)/);
  if (!m) return '';
  const n = m[1].includes('-') ? m[1].split('-').pop() : m[1];
  return n.slice(-2).padStart(2, '0');
}
function shortName(l) { return (l.last || l.first || '').slice(0, 10); }
function nameOf(l) { return `${l.first||''} ${l.last||''}`.trim() || l.last || l.addr || 'Lead'; }
function statusBadge(s) {
  if (['closed','knocked'].includes(s)) return 'hot';
  if (['set','sat','interested'].includes(s)) return 'blue';
  if (s === 'callback') return 'gold';
  if (['not_qualified','do_not_knock','not_interested'].includes(s)) return 'red';
  return '';
}

// ── Filtering ─────────────────────────────────────────────────────────────────
function scopedLeads() {
  const sess = session();
  let arr = state.leads || [];
  if (sess.role === 'agent') {
    const e = String(sess.email || '').toLowerCase(), n = String(sess.name || '').toLowerCase();
    arr = arr.filter(l => String(l.assigned_user_email || '').toLowerCase() === e || String(l.assigned_agent || '').toLowerCase() === n);
  }
  return arr;
}
function filterLeads(arr = scopedLeads()) {
  const f = state.filter || 'all';
  if (f === 'all') return arr;
  if (f === 'hot') return arr.filter(l => leadQuality(l) >= 70);
  if (f === 'high_sun') return arr.filter(l => sunScore(l) >= 75);
  if (f === 'manual') return arr.filter(l => l.source === 'manual');
  if (f === 'pluto') return arr.filter(l => l.source === 'pluto');
  if (f === 'imported') return arr.filter(l => l.source === 'imported');
  if (f === 'entity') return arr.filter(l => l.entity && !l.hpd_enriched);
  if (f === 'hpd') return arr.filter(l => l.hpd_enriched);
  if (f === 'acris') return arr.filter(l => l.acris_owner_names?.length);
  if (f === 'joint') return arr.filter(l => l.joint);
  if (f === 'verify') return arr.filter(l => l.needs_verify && !l.hpd_enriched);
  if (f === 'assigned') return arr.filter(l => l.assigned_agent || l.assigned_user_email);
  return arr.filter(l => (l.status || 'fresh') === f);
}
function filterLeadsBy(f, arr) {
  const old = state.filter; state.filter = f; const res = filterLeads(arr); state.filter = old; return res;
}
function todayLeads() { const d = new Date().toDateString(); return scopedLeads().filter(l => l.updated_at && new Date(l.updated_at).toDateString() === d); }
function isDue(l) { const d = new Date(l.callback_due || l.appt_time || ''); if (isNaN(d)) return false; const n = new Date(); return d.toDateString() === n.toDateString() || d < n; }

// ── Solar Enrichment ──────────────────────────────────────────────────────────
function enrichSolar(leads) {
  leads.forEach(l => {
    if (!l.zip) return;
    l.nrel_ghi = NYC_GHI[l.zip] || (l.boro === 'Queens' ? 4.35 : l.boro === 'Brooklyn' ? 4.22 : 4.20);
  });
}

// ── PLUTO Parsing ─────────────────────────────────────────────────────────────
function title(s) { return String(s || '').toLowerCase().replace(/\b\w/g, m => m.toUpperCase()); }
function parsePersonOwner(part) {
  const clean = String(part || '').toUpperCase().trim().replace(/\b(JR|SR|II|III|IV|MD|PHD|ESQ)\.?$/, '').trim();
  const bits = clean.split(/\s+/).filter(Boolean);
  if (bits.length < 2) return null;
  return { first:title(bits[1]), last:title(bits[0]) };
}
function parseOwner(raw, includeLLC = true, allowVerify = true) {
  if (!raw) return null;
  const up = String(raw).toUpperCase().trim();
  const ent = ['LLC','L.L.C','CORP','INC','TRUST','ESTATE','REALTY','PROPERTIES','HOLDINGS','MANAGEMENT','ASSOCIATES','BANK','CITY OF','NYC','LTD',' LLP',' LP ','CO-OP','CONDO'].some(t => up.includes(t));
  if (ent) return includeLLC ? { first:'', last:title(raw).slice(0, 44), entity:true, raw } : null;
  const ownerParts = up.split(/\s+(?:&|AND)\s+/).map(x => x.trim()).filter(Boolean);
  const primary = parsePersonOwner(ownerParts[0]);
  if (!primary) {
    if (!allowVerify) return null;
    return { first:'', last:title(ownerParts[0] || raw), needs_verify:true, raw };
  }
  const result = { ...primary, raw };
  if (ownerParts.length > 1) {
    const second = parsePersonOwner(ownerParts[1]);
    if (second) {
      result.joint = true;
      result.coowner = second.last === primary.last ? second.first : `${second.first} ${second.last}`;
    }
  }
  return result;
}
function plutoToLead(p) {
  const set = settings(), parsed = parseOwner(p.ownername, set.include_llc !== false, set.allow_verify !== false);
  if (!parsed || !p.latitude || !p.longitude) return null;
  return {
    id: 'p_' + (p.bbl || Date.now() + Math.random()), source:'pluto', status:'fresh',
    bbl:p.bbl, first:parsed.first, last:parsed.last, entity:parsed.entity, needs_verify:parsed.needs_verify, joint:parsed.joint, coowner:parsed.coowner,
    raw_owner:p.ownername, addr:title(p.address || ''),
    boro: p.borough === 'QN' ? 'Queens' : p.borough === 'BK' ? 'Brooklyn' : p.borough,
    zip:p.zipcode || '', lat:+p.latitude, lng:+p.longitude,
    bldg_class:p.bldgclass || '', units:+p.unitsres || 1, year_built:+p.yearbuilt || '',
    lot_sqft:+p.lotarea || '', est_value:+p.assesstot || '',
    assigned_agent:'', territory: p.borough === 'QN' ? 'Queens' : 'Brooklyn',
    solar_status:'unknown', heating_type:'unknown', monthly_bill:'', notes:'', updated_at:null
  };
}

// ── PLUTO Loader ──────────────────────────────────────────────────────────────
async function loadPlutoBounds(bounds, name = 'this area') {
  const _bp = billingPlan();
  if (_bp && _bp.leads < 999999 && state.leads.length >= _bp.leads) {
    upgradeModal(`Load more territory requires a higher lead limit (you're at ${state.leads.length.toLocaleString()}/${_bp.leads.toLocaleString()})`, null);
    return;
  }
  loadCancelled = false;
  const prog = document.getElementById('progress'), fill = document.getElementById('progFill'), sub = document.getElementById('progSub');
  prog.classList.add('open');
  document.getElementById('progTitle').textContent = `Loading ${name} owner names…`;
  fill.style.width = '0%';
  const existingBBL = new Set(state.leads.map(l => l.bbl).filter(Boolean).map(String));
  const existingIdentity = new Set(state.leads.map(leadIdentityKey));
  let added = 0, skipped = 0, newLeads = [];
  try {
    const where = [
      `latitude > ${bounds[0]}`, `latitude < ${bounds[2]}`,
      `longitude > ${bounds[1]}`, `longitude < ${bounds[3]}`,
      `(borough='BK' OR borough='QN')`,
      `(starts_with(bldgclass,'A') OR starts_with(bldgclass,'B'))`,
      `ownername IS NOT NULL`
    ].join(' AND ');
    const url = `${PLUTO}?$where=${encodeURIComponent(where)}&$limit=50000&$select=bbl,address,borough,bldgclass,ownername,yearbuilt,lotarea,assesstot,unitsres,zipcode,latitude,longitude`;
    let data = await territoryCacheGet(bounds,!navigator.onLine);
    if(data){sub.textContent=`Using cached ${name} records${navigator.onLine?'':' · offline'}`;}
    else {
      if(!navigator.onLine)throw new Error('This territory is not cached yet. Reconnect once and load it before going offline.');
      sub.textContent = 'Fetching NYC PLUTO records…';
      const resp = await fetch(url);
      if (!resp.ok) { const err = await resp.text(); throw new Error(`API ${resp.status}: ${err.slice(0, 120)}`); }
      data = await resp.json();
      if(Array.isArray(data))territoryCachePut(bounds,name,data);
    }
    if (!Array.isArray(data)) throw new Error('Bad response: ' + JSON.stringify(data).slice(0, 120));
    for (let i = 0; i < data.length; i++) {
      if (loadCancelled) break;
      const p = data[i];
      if (p.bbl && existingBBL.has(String(p.bbl))) { skipped++; continue; }
      const l = plutoToLead(p);
      if (!l) { skipped++; continue; }
      const identity=leadIdentityKey(l);
      if(existingIdentity.has(identity)){skipped++;continue;}
      state.leads.push(l); newLeads.push(l);
      if (l.bbl) existingBBL.add(String(l.bbl)); existingIdentity.add(identity);
      added++;
      if (i % 250 === 0) { fill.style.width = Math.round(i / data.length * 100) + '%'; sub.textContent = `${added} added · ${skipped} skipped`; }
    }
    if (added > 0) {
      enrichSolar(newLeads);
      newLeads.forEach(l => { const idx = state.leads.findIndex(x => x.id === l.id); if (idx >= 0) state.leads[idx] = l; });
    }
    saveState(); renderAll(); upsertBatch(newLeads);
    info(`✓ ${name}: ${added} homes · solar enriched by ZIP`);
    toast(`✓ Loaded ${added} homes`);
  } catch(e) {
    info('PLUTO load failed: ' + e.message); toast('PLUTO load failed');
  } finally {
    prog.classList.remove('open');
  }
}

// ── Free HPD Owner Enrichment ────────────────────────────────────────────────
// Cross-references entity/uncertain PLUTO owners with NYC HPD's public registry.
const HPD_REGS = 'https://data.cityofnewyork.us/resource/tesw-yqqr.json';
const HPD_CONTACTS = 'https://data.cityofnewyork.us/resource/feu5-w2e2.json';
const HPD_PRIORITY = { IndividualOwner:1, JointOwner:2, HeadOfficer:3, Owner:4, CorporateOwner:5, Agent:6, SiteManager:7 };
function hpdLotKeyFromBBL(bbl) {
  const raw=String(bbl||'').replace(/\D/g,'').padStart(10,'0').slice(-10);
  return `${parseInt(raw.slice(0,1),10)}-${parseInt(raw.slice(1,6),10)}-${parseInt(raw.slice(6,10),10)}`;
}
function hpdLotKey(row) { return `${parseInt(row.boroid,10)}-${parseInt(row.block,10)}-${parseInt(row.lot,10)}`; }
function applyHPDContact(lead,c) {
  if(!lead||!c)return false;
  lead.original_entity_name=lead.original_entity_name||nameOf(lead); lead.first=title(c.firstname); lead.last=title(c.lastname);
  lead.entity_resolved=true; lead.hpd_enriched=true; lead.hpd_type=c.type||'';
  lead.hpd_business_addr=[c.businesshousenumber,c.businessstreetname].filter(Boolean).join(' ');
  lead.hpd_business_city=c.businesscity||''; lead.hpd_business_state=c.businessstate||''; lead.hpd_business_zip=c.businesszip||'';
  lead.hpd_checked_at=new Date().toISOString(); lead.updated_at=new Date().toISOString(); return true;
}
async function enrichWithHPD(scope = 'view') {
  let candidates = state.leads.filter(l => l.bbl && !l.hpd_enriched && (l.entity || l.needs_verify));
  if (scope === 'view') {
    const b = map.getBounds();
    candidates = candidates.filter(l => l.lat && l.lng && b.contains([+l.lat,+l.lng]));
  }
  if (!candidates.length) return toast('No LLC / verify leads to enrich here');
  let cachedMatched=0;
  if(typeof enrichmentCacheGet==='function'){
    const cached=await enrichmentCacheGet(candidates.map(l=>'hpd:'+String(l.bbl)));
    candidates=candidates.filter(l=>{const k='hpd:'+String(l.bbl);if(!cached.has(k))return true;const c=cached.get(k);if(c&&applyHPDContact(l,c))cachedMatched++;return false;});
    if(!candidates.length){saveState();renderAll();return toast(`✓ HPD cache restored ${cachedMatched} owners`);}
  }
  const prog=document.getElementById('progress'), fill=document.getElementById('progFill'), sub=document.getElementById('progSub');
  prog.classList.add('open'); document.getElementById('progTitle').textContent=`Unmasking ${candidates.length} owners…`; fill.style.width='2%';
  const regs=[]; const byLot=new Map(candidates.map(l=>[hpdLotKeyFromBBL(l.bbl),l]));
  try {
    for (let i=0;i<candidates.length;i+=75) {
      if (loadCancelled) break;
      const batch=candidates.slice(i,i+75), where=batch.map(l=>{const [boro,block,lot]=hpdLotKeyFromBBL(l.bbl).split('-');return `(boroid='${boro}' AND block='${block}' AND lot='${lot}')`;}).join(' OR ');
      const r=await fetch(`${HPD_REGS}?$where=${encodeURIComponent(where)}&$limit=500&$select=registrationid,boroid,block,lot`);
      if (!r.ok) throw Error(`HPD registrations ${r.status}`);
      regs.push(...await r.json()); fill.style.width=Math.min(48,Math.round((i+75)/candidates.length*48))+'%'; sub.textContent=`Registrations: ${regs.length}`;
    }
    const regToLead=new Map(); regs.forEach(r=>{const l=byLot.get(hpdLotKey(r)); if(l) regToLead.set(String(r.registrationid),l);});
    const ids=[...regToLead.keys()]; if(!ids.length){toast('No HPD registrations found'); return;}
    const best=new Map();
    for(let i=0;i<ids.length;i+=90){
      if(loadCancelled) break;
      const batch=ids.slice(i,i+90), where=batch.map(id=>`registrationid='${id.replace(/'/g,"''")}'`).join(' OR ');
      const r=await fetch(`${HPD_CONTACTS}?$where=${encodeURIComponent(where)}&$limit=1000&$select=registrationid,type,firstname,middleinitial,lastname,corporationname,businesshousenumber,businessstreetname,businesscity,businessstate,businesszip`);
      if(!r.ok) throw Error(`HPD contacts ${r.status}`);
      for(const c of await r.json()){
        if(!c.firstname || !c.lastname) continue;
        const old=best.get(String(c.registrationid));
        if(!old || (HPD_PRIORITY[c.type]||99)<(HPD_PRIORITY[old.type]||99)) best.set(String(c.registrationid),c);
      }
      fill.style.width=(50+Math.min(48,Math.round((i+90)/ids.length*48)))+'%'; sub.textContent=`Contacts matched: ${best.size}`;
    }
    let matched=0; const cacheEntries=[];
    best.forEach((c,id)=>{const l=regToLead.get(id); if(!l)return; if(applyHPDContact(l,c)){matched++;cacheEntries.push(['hpd:'+String(l.bbl),c]);}});
    if(typeof enrichmentCachePut==='function'&&cacheEntries.length)await enrichmentCachePut(cacheEntries,30);
    saveState(); renderAll(); toast(`✓ HPD unmasked ${matched+cachedMatched} owners`); info(`HPD: ${matched+cachedMatched} real owner names added`);
  } catch(e) { toast('HPD enrichment failed'); info('HPD failed: '+e.message); }
  finally { prog.classList.remove('open'); }
}

// ── ACRIS Deed Freshness ─────────────────────────────────────────────────────
const ACRIS_LEGALS='https://data.cityofnewyork.us/resource/8h5j-fqxa.json';
const ACRIS_MASTER='https://data.cityofnewyork.us/resource/bnx9-e6tj.json';
const ACRIS_PARTIES='https://data.cityofnewyork.us/resource/636b-3b5g.json';
function parseAcrisBuyer(raw){
  const s=String(raw||'').trim(); if(!s)return null;
  if(/\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|CO\.?|TRUST|ESTATE|ASSOCIATES|HOLDINGS|REALTY|PROPERTIES|PARTNERS)\b/i.test(s))return {first:'',last:title(s),full:title(s),entity:true};
  if(s.includes(',')){const [last,rest]=s.split(',',2),bits=rest.trim().split(/\s+/);return {first:title(bits[0]||''),last:title(last),full:title(`${bits[0]||''} ${last}`)};}
  const bits=s.split(/\s+/); if(bits.length<2)return {first:'',last:title(s),full:title(s)};
  // ACRIS commonly stores people as LAST FIRST when no comma is present.
  return {first:title(bits.slice(1).join(' ')),last:title(bits[0]),full:title(`${bits.slice(1).join(' ')} ${bits[0]}`)};
}
function applyAcrisValue(lead,value){
  if(!lead||!value)return false;
  lead.acris_owner_names=value.names||[]; lead.acris_recorded_at=value.recorded_at||''; lead.acris_document_id=value.document_id||'';
  lead.acris_checked_at=new Date().toISOString(); lead.owner_freshness=value.freshness||'historical_deed';
  const primary=parseAcrisBuyer(lead.acris_owner_names[0]);
  if(primary && (value.freshness==='recent_deed'||lead.entity||lead.needs_verify)){
    lead.original_owner_name=lead.original_owner_name||nameOf(lead); lead.first=primary.first; lead.last=primary.last;
    const second=parseAcrisBuyer(lead.acris_owner_names[1]); if(second){lead.joint=true;lead.coowner=second.full;}
    lead.acris_promoted=true;
  }
  return true;
}
async function enrichWithACRIS(scope='view'){
  let candidates=state.leads.filter(l=>l.bbl);
  if(scope==='view'){const b=map.getBounds();candidates=candidates.filter(l=>l.lat&&l.lng&&b.contains([+l.lat,+l.lng]));}
  if(!candidates.length)return toast('No BBL leads to check with ACRIS');
  let cachedCount=0;
  if(typeof enrichmentCacheGet==='function'){
    const cached=await enrichmentCacheGet(candidates.map(l=>'acris:'+String(l.bbl)));
    candidates=candidates.filter(l=>{const k='acris:'+String(l.bbl);if(!cached.has(k))return true;const v=cached.get(k);if(v&&applyAcrisValue(l,v))cachedCount++;return false;});
    if(!candidates.length){saveState();renderAll();return toast(`✓ ACRIS cache restored ${cachedCount} records`);}
  }
  const prog=document.getElementById('progress'),fill=document.getElementById('progFill'),sub=document.getElementById('progSub');
  prog.classList.add('open');document.getElementById('progTitle').textContent=`Checking ${candidates.length} deeds…`;fill.style.width='2%';loadCancelled=false;
  const docToLeads=new Map(), newestByLead=new Map();
  try{
    for(let i=0;i<candidates.length;i+=20){
      if(loadCancelled)break;const batch=candidates.slice(i,i+20);
      const where=batch.map(l=>{const [borough,block,lot]=hpdLotKeyFromBBL(l.bbl).split('-');return `(borough=${borough} AND block=${block} AND lot=${lot})`;}).join(' OR ');
      const r=await fetch(`${ACRIS_LEGALS}?$where=${encodeURIComponent(where)}&$limit=4000&$order=${encodeURIComponent('document_id DESC')}&$select=document_id,borough,block,lot`);
      if(!r.ok)throw Error(`ACRIS legals ${r.status}`);
      const byLot=new Map(batch.map(l=>[hpdLotKeyFromBBL(l.bbl),l]));
      for(const d of await r.json()){const l=byLot.get(`${parseInt(d.borough,10)}-${parseInt(d.block,10)}-${parseInt(d.lot,10)}`);if(!l)continue;const arr=docToLeads.get(d.document_id)||[];arr.push(l);docToLeads.set(d.document_id,arr);}
      fill.style.width=Math.min(33,Math.round((i+20)/candidates.length*33))+'%';sub.textContent=`ACRIS documents: ${docToLeads.size}`;
    }
    const docIds=[...docToLeads.keys()];
    for(let i=0;i<docIds.length;i+=50){
      const ids=docIds.slice(i,i+50),where=`document_id in (${ids.map(x=>`'${String(x).replace(/'/g,"''")}'`).join(',')}) AND starts_with(doc_type,'DEED')`;
      const r=await fetch(`${ACRIS_MASTER}?$where=${encodeURIComponent(where)}&$limit=200&$select=document_id,doc_type,document_date,recorded_datetime`);if(!r.ok)throw Error(`ACRIS master ${r.status}`);
      for(const d of await r.json())for(const l of docToLeads.get(d.document_id)||[]){const old=newestByLead.get(l.id);if(!old||new Date(d.recorded_datetime||0)>new Date(old.recorded_datetime||0))newestByLead.set(l.id,d);}
      fill.style.width=(34+Math.min(32,Math.round((i+50)/Math.max(1,docIds.length)*32)))+'%';sub.textContent=`Deeds found: ${newestByLead.size}`;
    }
    const selected=[...new Set([...newestByLead.values()].map(x=>x.document_id))],partiesByDoc=new Map();
    for(let i=0;i<selected.length;i+=50){
      const ids=selected.slice(i,i+50),where=`document_id in (${ids.map(x=>`'${String(x).replace(/'/g,"''")}'`).join(',')}) AND party_type='2'`;
      const r=await fetch(`${ACRIS_PARTIES}?$where=${encodeURIComponent(where)}&$limit=500&$select=document_id,party_type,name,address_1,address_2,city,state,zip`);if(!r.ok)throw Error(`ACRIS parties ${r.status}`);
      for(const p of await r.json()){const arr=partiesByDoc.get(p.document_id)||[];if(p.name&&!arr.includes(p.name))arr.push(p.name);partiesByDoc.set(p.document_id,arr);}
      fill.style.width=(67+Math.min(31,Math.round((i+50)/Math.max(1,selected.length)*31)))+'%';sub.textContent=`Buyer records: ${partiesByDoc.size}`;
    }
    let matched=0;const cache=[];const now=Date.now();
    for(const l of candidates){const deed=newestByLead.get(l.id);if(!deed)continue;const names=partiesByDoc.get(deed.document_id)||[];if(!names.length)continue;const ageDays=(now-new Date(deed.recorded_datetime||deed.document_date||0).getTime())/86400000;const value={names,recorded_at:deed.recorded_datetime||deed.document_date,document_id:deed.document_id,freshness:ageDays<=550?'recent_deed':'historical_deed'};if(applyAcrisValue(l,value)){matched++;cache.push(['acris:'+String(l.bbl),value]);}}
    if(typeof enrichmentCachePut==='function'&&cache.length)await enrichmentCachePut(cache,30);
    saveState();renderAll();toast(`✓ ACRIS matched ${matched+cachedCount} owners`);info(`ACRIS: ${matched+cachedCount} deed-owner records refreshed`);
  }catch(e){toast('ACRIS lookup failed');info('ACRIS failed: '+e.message);}
  finally{prog.classList.remove('open');}
}

// ── Navigation Helpers ────────────────────────────────────────────────────────
function nextBestLead() {
  return filterLeads().filter(l => !['closed','not_interested','do_not_knock','not_qualified'].includes(l.status))
    .sort((a, b) => leadQuality(b) - leadQuality(a) || sunScore(b) - sunScore(a))[0];
}
function goLead(l) {
  if (!l) return toast('No lead found');
  switchView('map');
  if (l.lat && l.lng) map.setView([+l.lat, +l.lng], 18);
  setTimeout(() => openLead(l.id), 160);
}

// ── Demo Mode ─────────────────────────────────────────────────────────────────
function demoMode() {
  state.leads = [
    ['High Sun Home','42-15 Sample Ave','Queens',40.728,-73.794,'interested',92,'No solar visible. Clean roof line. High bill.'],
    ['Boiler + Solar Lead','88-20 Demo Blvd','Queens',40.706,-73.821,'callback',86,'Oil heat. Good roof. Wants estimate tomorrow.'],
    ['Mini Split Opportunity','120 Sample Street','Queens',40.681,-73.835,'set',78,'Old boiler. Asked about rebates and monthly payment.'],
    ['Already Has Solar','230 Demo Lane','Long Island',40.761,-73.610,'not_qualified',28,'Panels visible. Existing solar.']
  ].map((r, i) => ({
    id:'demo_'+Date.now()+'_'+i, source:'Demo Mode', first:r[0], last:'', addr:r[1], boro:r[2],
    lat:r[3], lng:r[4], status:r[5], sun_score:r[6], notes:r[7],
    monthly_bill: i < 3 ? '250' : '', solar_status: i === 3 ? 'has_solar' : 'no_solar_visible',
    assigned_agent: i < 3 ? 'Demo Rep' : '', updated_at:new Date().toISOString(),
    activity_log:[{type:'demo',note:'Demo lead loaded',at:new Date().toISOString(),agent:'System'}]
  }));
  saveState(); saveSession({ role:'master', name:'Demo Master', demo:true });
  document.getElementById('loginOverlay').classList.remove('open');
  renderAll(); toast('✓ Demo mode loaded');
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function requestNotifPerm() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  await Notification.requestPermission();
}
const callbackTimers=new Map();
function scheduleCallbackNotifs() {
  callbackTimers.forEach(t=>clearTimeout(t));callbackTimers.clear();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  scopedLeads().filter(l => l.callback_due || l.appt_time).forEach(l => {
    const dt = new Date(l.callback_due || l.appt_time), ms = dt - now;
    if (isNaN(dt) || ms < 0 || ms > 86400000) return;
    callbackTimers.set(l.id,setTimeout(() => new Notification('BlockBoss CRM — Follow-up due', { body:`${nameOf(l)} · ${l.addr||''}`, tag:'cb-'+l.id, silent:false }), ms));
  });
}
function checkDueCallbacks(){
  const now=Date.now(),recent=now-60000;
  const l=scopedLeads().find(x=>x.callback_due&&new Date(x.callback_due)<=now&&new Date(x.callback_due)>=recent&&!x.callback_alerted_at);
  if(!l)return;l.callback_alerted_at=new Date().toISOString();saveState();toast(`📞 Callback due: ${nameOf(l)}`);
}

// ── Neighborhoods Modal ───────────────────────────────────────────────────────
function neighborhoods() {
  const html = `<p class="sub">Bulk-load NYC PLUTO-style homeowner names. Queens/Brooklyn included because that's where the original CRM focused.</p>
<h3>Queens</h3><div class="action-grid">${NEIGHBORHOODS.queens.map((n, i) => `<button data-action="loadNbh" data-boro="queens" data-i="${i}">${n[0]}</button>`).join('')}</div>
<h3 style="margin-top:14px">Brooklyn</h3><div class="action-grid">${NEIGHBORHOODS.brooklyn.map((n, i) => `<button data-action="loadNbh" data-boro="brooklyn" data-i="${i}">${n[0]}</button>`).join('')}</div>`;
  modal('📍 Neighborhood Loader', html);
}

// ── Offline Neighborhood Downloads ───────────────────────────────────────────
function offlineAreaMeta(){try{return JSON.parse(localStorage.getItem('m2_offline_areas_v1'))||{};}catch(e){return {};}}
function saveOfflineAreaMeta(v){localStorage.setItem('m2_offline_areas_v1',JSON.stringify(v));}
function offlinePlutoUrl(bounds){
  const where=[`latitude > ${bounds[0]}`,`latitude < ${bounds[2]}`,`longitude > ${bounds[1]}`,`longitude < ${bounds[3]}`,`(borough='BK' OR borough='QN')`,`(starts_with(bldgclass,'A') OR starts_with(bldgclass,'B'))`,`ownername IS NOT NULL`].join(' AND ');
  return `${PLUTO}?$where=${encodeURIComponent(where)}&$limit=50000&$select=bbl,address,borough,bldgclass,ownername,yearbuilt,lotarea,assesstot,unitsres,zipcode,latitude,longitude`;
}
function tileXY(lat,lng,z){const n=2**z;return{x:Math.floor((lng+180)/360*n),y:Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n)};}
function offlineTiles(bounds){
  const out=[];for(let z=14;z<=16;z++){const nw=tileXY(bounds[2],bounds[1],z),se=tileXY(bounds[0],bounds[3],z);for(let x=nw.x;x<=se.x;x++)for(let y=nw.y;y<=se.y;y++)out.push(`https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);}
  if(out.length<=240)return out;const sampled=[];for(let i=0;i<240;i++)sampled.push(out[Math.floor(i*(out.length-1)/239)]);return [...new Set(sampled)];
}
async function offlineNeighborhoods(){
  const meta=offlineAreaMeta(),rows=[];
  for(const boro of ['queens','brooklyn'])for(let i=0;i<NEIGHBORHOODS[boro].length;i++){const n=NEIGHBORHOODS[boro][i],k=`${boro}-${i}`,saved=meta[k];rows.push(`<div class="offline-area-row" id="offline-${k}"><div class="area-info"><b>${esc(n[0])}</b><span>${saved?`✓ Ready · ${new Date(saved.at).toLocaleDateString()} · ${saved.homes||0} homes`:'Not downloaded'}</span></div><button data-action="downloadOfflineArea" data-boro="${boro}" data-i="${i}">${saved?'Refresh':'Download'}</button></div>`);}
  modal('📥 Offline Neighborhoods',`<p class="sub">Download homeowner records and map tiles before your shift. Keep the app open until each area says Ready.</p><div id="offlineAreaProgress"></div>${rows.join('')}`);
  for(const boro of ['queens','brooklyn'])for(let i=0;i<NEIGHBORHOODS[boro].length;i++){const n=NEIGHBORHOODS[boro][i],cached=await territoryCacheGet(n[1],true);if(cached?.length){const el=document.querySelector(`#offline-${boro}-${i} .area-info span`);if(el&&!meta[`${boro}-${i}`])el.textContent=`Property cache found · ${cached.length} homes`;}}
}
async function downloadNeighborhoodOffline(boro,i){
  const n=NEIGHBORHOODS[boro]?.[i];if(!n)return;if(!navigator.onLine)return toast('Connect to download this area');
  const row=document.getElementById(`offline-${boro}-${i}`),status=row?.querySelector('.area-info span'),btn=row?.querySelector('button');if(btn)btn.disabled=true;
  try{
    if(status)status.textContent='Downloading homeowner records…';let data=await territoryCacheGet(n[1]);
    if(!data){const r=await fetch(offlinePlutoUrl(n[1]));if(!r.ok)throw Error(`PLUTO ${r.status}`);data=await r.json();await territoryCachePut(n[1],n[0],data,14);}
    const tiles=offlineTiles(n[1]);let done=0;
    for(let x=0;x<tiles.length;x+=6){await Promise.all(tiles.slice(x,x+6).map(u=>fetch(u,{mode:'no-cors'}).catch(()=>null)));done=Math.min(x+6,tiles.length);if(status)status.textContent=`Caching map ${done}/${tiles.length}…`;}
    const meta=offlineAreaMeta();meta[`${boro}-${i}`]={at:new Date().toISOString(),homes:data.length,tiles:tiles.length,name:n[0]};saveOfflineAreaMeta(meta);
    if(status)status.textContent=`✓ Ready offline · ${data.length} homes · ${tiles.length} map tiles`;if(btn){btn.disabled=false;btn.textContent='Refresh';}navigator.vibrate?.(20);toast(`✓ ${n[0]} ready offline`);
  }catch(e){if(status)status.textContent='Download failed · tap to retry';if(btn)btn.disabled=false;toast('Offline download failed');console.warn(e);}
}
