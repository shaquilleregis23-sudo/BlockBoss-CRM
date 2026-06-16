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
  if (f === 'entity') return arr.filter(l => l.entity);
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
function parseOwner(raw, includeLLC = true, allowVerify = true) {
  if (!raw) return null;
  const up = raw.toUpperCase().trim();
  const ent = ['LLC','CORP','INC','TRUST','ESTATE','REALTY','PROPERTIES','HOLDINGS','MANAGEMENT','ASSOCIATES','BANK','CITY OF','NYC'].some(t => up.includes(t));
  if (ent) return includeLLC ? { first:'', last:title(raw).slice(0, 44), entity:true, raw } : null;
  const primary = up.split('&')[0].trim().replace(/\b(JR|SR|II|III|IV)\.?$/, '').trim();
  const p = primary.split(/\s+/).filter(Boolean);
  if (p.length < 2 && !allowVerify) return null;
  if (p.length < 2) return { first:'', last:title(p[0] || raw), needs_verify:true, raw };
  return { first:title(p[1]), last:title(p[0]), raw };
}
function plutoToLead(p) {
  const set = settings(), parsed = parseOwner(p.ownername, set.include_llc !== false, set.allow_verify !== false);
  if (!parsed || !p.latitude || !p.longitude) return null;
  return {
    id: 'p_' + (p.bbl || Date.now() + Math.random()), source:'pluto', status:'fresh',
    bbl:p.bbl, first:parsed.first, last:parsed.last, entity:parsed.entity, needs_verify:parsed.needs_verify,
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
  const existing = new Set(state.leads.map(l => l.bbl).filter(Boolean));
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
    sub.textContent = 'Fetching NYC PLUTO records…';
    const resp = await fetch(url);
    if (!resp.ok) { const err = await resp.text(); throw new Error(`API ${resp.status}: ${err.slice(0, 120)}`); }
    const data = await resp.json();
    if (!Array.isArray(data)) throw new Error('Bad response: ' + JSON.stringify(data).slice(0, 120));
    for (let i = 0; i < data.length; i++) {
      if (loadCancelled) break;
      const p = data[i];
      if (p.bbl && existing.has(p.bbl)) { skipped++; continue; }
      const l = plutoToLead(p);
      if (!l) { skipped++; continue; }
      state.leads.push(l); newLeads.push(l);
      if (l.bbl) existing.add(l.bbl);
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
  const now = Date.now();
  const ts  = (hoursAgo, minsAgo=0) => new Date(now - hoursAgo*3600000 - minsAgo*60000).toISOString();
  const fut = (hoursAhead)           => new Date(now + hoursAhead*3600000).toISOString();

  // Demo account — 3 reps, realistic company
  saveSettings({ company:'Queens Solar Solutions', territory:'Jamaica / Rosedale / Springfield Gardens', agent_name:'Marcus J.', plan:'team', door_goal:60, appt_goal:3 });
  saveAccount({
    company:'Queens Solar Solutions',
    agents:[
      { id:'d1', name:'Marcus J.',  email:'marcus@demo.com',  territory:'Jamaica, Queens',           role:'agent' },
      { id:'d2', name:'Kezia P.',   email:'kezia@demo.com',   territory:'Rosedale, Queens',           role:'agent' },
      { id:'d3', name:'Tyrese A.',  email:'tyrese@demo.com',  territory:'Springfield Gardens, Queens', role:'agent' }
    ]
  });
  saveSession({ role:'master', name:'Demo Manager', email:'demo@blockbosscrm.com', demo:true });

  const mk = (i, o) => ({
    id:'demo_'+i, source:'PLUTO', first:'', last:'', addr:'', boro:'Queens',
    lat:40.697, lng:-73.803, status:'fresh', sun_score:70, notes:'', agent:'',
    monthly_bill:'', roof_type:'Pitched', solar_status:'no_solar_visible',
    phone:'', email:'', appt_time:'', callback_due:'', logs:[],
    created_at:ts(72+i), updated_at:ts(2), ...o
  });

  state.leads = [
    // ── CLOSED ──────────────────────────────────────────────────────────────────
    mk(0,{ first:'Wilson', last:'Denise', addr:'183-20 Jamaica Ave', lat:40.6897, lng:-73.7691,
      status:'closed', sun_score:92, agent:'Marcus J.', monthly_bill:'360', phone:'(718) 555-0101',
      notes:'CLOSED ✓ Signed contract. $360/mo bill. Full system. Referral to neighbor next door.',
      logs:[{action:'knocked',note:'First visit',ts:ts(120)},{action:'interested',note:'Very interested',ts:ts(96)},{action:'set',note:'Site visit scheduled',ts:ts(72)},{action:'closed',note:'Contract signed! Full system 🏆',ts:ts(24)}] }),

    // ── APPT SET ─────────────────────────────────────────────────────────────────
    mk(1,{ first:'Davis', last:'Robert', addr:'126-08 Sutphin Blvd', lat:40.7012, lng:-73.8082,
      status:'set', sun_score:94, agent:'Marcus J.', monthly_bill:'380', phone:'(718) 555-0147',
      appt_time:fut(48), notes:'$380 bill. Large south-facing roof. Appointment Thursday 10am. Closer assigned.',
      logs:[{action:'knocked',note:'Answered door on first knock',ts:ts(26)},{action:'interested',note:'Strong interest — wants savings breakdown',ts:ts(25)},{action:'set',note:'Thursday 10am — wife will be home too',ts:ts(24)}] }),

    mk(2,{ first:'Garcia', last:'Maria', addr:'152-44 Rockaway Blvd', lat:40.6754, lng:-73.7834,
      status:'set', sun_score:87, agent:'Tyrese A.', monthly_bill:'290', phone:'(929) 555-0263',
      appt_time:fut(20), notes:'Spanish-speaking. $290/mo. Appointment tomorrow 2pm. Son will translate.',
      logs:[{action:'knocked',note:'Spanish-speaking homeowner',ts:ts(9)},{action:'interested',note:'Interested — called son for help',ts:ts(8)},{action:'set',note:'Tomorrow 2pm',ts:ts(7)}] }),

    // ── INTERESTED ───────────────────────────────────────────────────────────────
    mk(3,{ first:'Johnson', last:'Michael', addr:'142-35 Franklin Ave', lat:40.6982, lng:-73.7891,
      status:'interested', sun_score:91, agent:'Marcus J.', monthly_bill:'280', phone:'(718) 555-0182',
      notes:'$280 electric bill. Owns home 18 yrs. Both husband and wife on board. Wants savings estimate.',
      logs:[{action:'knocked',note:'Knocked, both home',ts:ts(30)},{action:'interested',note:'Both on board — wants full estimate',ts:ts(29)}] }),

    mk(4,{ first:'Williams', last:'Patricia', addr:'168-20 109th Ave', lat:40.6934, lng:-73.7756,
      status:'interested', sun_score:88, agent:'Marcus J.', monthly_bill:'320',
      notes:'$320/mo. Saw neighbor get solar last year. Comparing quotes. Very warm.',
      logs:[{action:'knocked',note:'No answer first visit',ts:ts(55)},{action:'knocked',note:'Caught her outside',ts:ts(28)},{action:'interested',note:'Warm — comparing 3 quotes',ts:ts(27)}] }),

    mk(5,{ first:'Thompson', last:'James', addr:'196-12 Linden Blvd', lat:40.6821, lng:-73.7523,
      status:'interested', sun_score:84, agent:'Kezia P.', monthly_bill:'240',
      notes:'Retired MTA. Owns home outright. $240/mo. Ready to schedule site visit.',
      logs:[{action:'knocked',note:'Home all day',ts:ts(10)},{action:'interested',note:'Ready for site visit',ts:ts(9)}] }),

    mk(6,{ first:'Brown', last:'Sandra', addr:'204-11 Hollis Ave', lat:40.7063, lng:-73.7621,
      status:'interested', sun_score:79, agent:'Kezia P.', monthly_bill:'210', phone:'(718) 555-0199',
      notes:'$210 bill. Husband not home. Took flyer, will discuss with him.',
      logs:[{action:'knocked',note:'Spoke with Sandra',ts:ts(4)},{action:'interested',note:'Took flyer — calling back tonight',ts:ts(4)}] }),

    // ── CALLBACKS ────────────────────────────────────────────────────────────────
    mk(7,{ first:'Martin', last:'Kevin', addr:'111-42 Farmers Blvd', lat:40.6921, lng:-73.7484,
      status:'callback', sun_score:82, agent:'Tyrese A.', monthly_bill:'270', phone:'(718) 555-0339',
      callback_due:ts(2), notes:'Wants to speak to wife first. Call back after 5pm. $270 bill, big south roof.',
      logs:[{action:'knocked',note:'Spoke to Kevin at door',ts:ts(6)},{action:'callback',note:'Callback tonight after 5pm',ts:ts(6)}] }),

    mk(8,{ first:'Anderson', last:'Gloria', addr:'235-15 Merrick Blvd', lat:40.6683, lng:-73.7532,
      status:'callback', sun_score:76, agent:'Kezia P.', monthly_bill:'195', phone:'(718) 555-0274',
      callback_due:ts(3), notes:'Wants to call her daughter first. Very sweet. Callback scheduled.',
      logs:[{action:'knocked',note:'Listened to full pitch',ts:ts(25)},{action:'callback',note:'Call after she talks to daughter',ts:ts(25)}] }),

    mk(9,{ first:'Taylor', last:'Richard', addr:'178-22 Guy Brewer Blvd', lat:40.6849, lng:-73.7698,
      status:'callback', sun_score:71, agent:'Marcus J.', monthly_bill:'430', phone:'(646) 555-0158',
      callback_due:fut(3), notes:'Contractor who owns 2 homes. Interested in doing both. Call tonight 7pm.',
      logs:[{action:'knocked',note:'Owns this + another property on next block',ts:ts(5)},{action:'callback',note:'Call tonight 7pm for both homes',ts:ts(5)}] }),

    // ── NOT HOME ─────────────────────────────────────────────────────────────────
    mk(10,{ first:'Jackson', last:'Evelyn', addr:'145-33 Springfield Blvd', lat:40.6763, lng:-73.7691,
      status:'not_home', sun_score:86, agent:'Tyrese A.',
      notes:'Not home twice. Try weekday morning — PLUTO shows long-term owner. High sun score.',
      logs:[{action:'knocked',note:'No answer',ts:ts(60)},{action:'not_home',note:'No answer again. Try AM weekday.',ts:ts(30)}] }),

    mk(11,{ first:'Harris', last:'Charles', addr:'119-08 Inwood St', lat:40.6921, lng:-73.8012,
      status:'not_home', sun_score:78, agent:'Marcus J.',
      notes:'Car in driveway but no answer. Try late morning.',
      logs:[{action:'knocked',note:'Car in driveway, no answer',ts:ts(8)},{action:'not_home',note:'Still no answer',ts:ts(3)}] }),

    mk(12,{ first:'Robinson', last:'Shirley', addr:'231-44 148th Rd', lat:40.6712, lng:-73.7523,
      status:'not_home', sun_score:68, agent:'Kezia P.',
      notes:'Neighbor said she works until 4pm. Try after 4.',
      logs:[{action:'knocked',note:'Neighbor confirmed home after 4pm',ts:ts(5)},{action:'not_home',note:'At work',ts:ts(5)}] }),

    mk(13,{ first:'Lewis', last:'Barbara', addr:'189-15 Hollis Ave', lat:40.7063, lng:-73.7584,
      status:'not_home', sun_score:73, agent:'Tyrese A.',
      notes:'Lights on inside. Empty driveway. Try evening.',
      logs:[{action:'knocked',note:'Lights on but no answer',ts:ts(6)}] }),

    // ── KNOCKED ──────────────────────────────────────────────────────────────────
    mk(14,{ first:'Lee', last:'Anthony', addr:'163-20 Jamaica Ave', lat:40.6897, lng:-73.7723,
      status:'knocked', sun_score:69, agent:'Marcus J.',
      notes:'Tenant, not owner. Got owner name from him — Marcus Green. Check PLUTO.',
      logs:[{action:'knocked',note:'Spoke to tenant, not owner',ts:ts(4)}] }),

    mk(15,{ first:'Walker', last:'Dorothy', addr:'215-08 115th Ave', lat:40.6892, lng:-73.7534,
      status:'knocked', sun_score:77, agent:'Kezia P.',
      notes:'Short convo. Busy, asked to come back after lunch.',
      logs:[{action:'knocked',note:'Come back after 1pm',ts:ts(3)}] }),

    mk(16,{ first:'Hall', last:'Edward', addr:'134-22 238th St', lat:40.7042, lng:-73.7167,
      status:'knocked', sun_score:65, agent:'Tyrese A.',
      notes:'In a hurry. Took card. Cold.',
      logs:[{action:'knocked',note:'In a rush. Took card.',ts:ts(2)}] }),

    mk(17,{ first:'Allen', last:'Frances', addr:'197-33 Linden Blvd', lat:40.6826, lng:-73.7492,
      status:'knocked', sun_score:81, agent:'Marcus J.',
      notes:'Listened through screen door. Husband has to approve.',
      logs:[{action:'knocked',note:'Screen door pitch. Warm.',ts:ts(1)}] }),

    // ── FRESH ────────────────────────────────────────────────────────────────────
    mk(18,{ first:'Young',     last:'Carolyn', addr:'172-44 130th Ave',     lat:40.6734, lng:-73.7612, status:'fresh', sun_score:89, agent:'Marcus J.', notes:'High sun score. South-facing roof visible from street.' }),
    mk(19,{ first:'Hernandez', last:'Jose',    addr:'146-30 Rockaway Blvd', lat:40.6801, lng:-73.7867, status:'fresh', sun_score:83, agent:'Kezia P.',  notes:'PLUTO: single-family residential. Owner-occupied.' }),
    mk(20,{ first:'King',      last:'Betty',   addr:'226-15 Merrick Blvd',  lat:40.6641, lng:-73.7545, status:'fresh', sun_score:77, agent:'Tyrese A.', notes:'Corner lot. Good roof angle. Check back of house.' }),
    mk(21,{ first:'Wright',    last:'George',  addr:'138-41 Sutphin Blvd',  lat:40.7045, lng:-73.8078, status:'fresh', sun_score:72, notes:'Older home, likely original owner. High bills on this block.' }),
    mk(22,{ first:'Lopez',     last:'Carmen',  addr:'159-22 Jamaica Ave',   lat:40.6907, lng:-73.7745, status:'fresh', sun_score:80, agent:'Kezia P.',  notes:'No solar visible. Pitched roof.' }),

    // ── NOT INTERESTED / NOT QUALIFIED ──────────────────────────────────────────
    mk(23,{ first:'Scott', last:'Helen', addr:'201-18 Hollis Ave', lat:40.7081, lng:-73.7601,
      status:'not_interested', sun_score:62, agent:'Kezia P.',
      notes:'Already looked into solar last year. Not interested. Do not re-knock.',
      logs:[{action:'knocked',note:'Spoke with Helen',ts:ts(48)},{action:'not_interested',note:'Already decided against solar.',ts:ts(48)}] }),

    mk(24,{ first:'Mitchell', last:'Frank', addr:'183-44 Baisley Blvd', lat:40.6782, lng:-73.7834,
      status:'not_qualified', sun_score:21, agent:'Tyrese A.', solar_status:'has_solar',
      notes:'Panels on roof — existing system. Not a solar prospect. Could be HVAC lead.',
      logs:[{action:'knocked',note:'Panels visible from street',ts:ts(26)},{action:'not_qualified',note:'Has solar. Possible HVAC lead.',ts:ts(26)}] }),
  ];

  saveState();
  document.getElementById('loginOverlay').classList.remove('open');
  fitLeads();
  renderAll();
  toast('✓ Demo loaded — 3 reps · 25 leads · Queens Solar Solutions');
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function requestNotifPerm() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  await Notification.requestPermission();
}
function scheduleCallbackNotifs() {
  if (Notification.permission !== 'granted') return;
  const now = Date.now();
  scopedLeads().filter(l => l.callback_due || l.appt_time).forEach(l => {
    const dt = new Date(l.callback_due || l.appt_time), ms = dt - now;
    if (isNaN(dt) || ms < 0 || ms > 86400000) return;
    setTimeout(() => new Notification('BlockBoss CRM — Follow-up due', { body:`${nameOf(l)} · ${l.addr||''}`, tag:'cb-'+l.id, silent:false }), ms);
  });
}

// ── Neighborhoods Modal ───────────────────────────────────────────────────────
function neighborhoods() {
  const html = `<p class="sub">Bulk-load NYC PLUTO-style homeowner names. Queens/Brooklyn included because that's where the original CRM focused.</p>
<h3>Queens</h3><div class="action-grid">${NEIGHBORHOODS.queens.map((n, i) => `<button data-action="loadNbh" data-boro="queens" data-i="${i}">${n[0]}</button>`).join('')}</div>
<h3 style="margin-top:14px">Brooklyn</h3><div class="action-grid">${NEIGHBORHOODS.brooklyn.map((n, i) => `<button data-action="loadNbh" data-boro="brooklyn" data-i="${i}">${n[0]}</button>`).join('')}</div>`;
  modal('📍 Neighborhood Loader', html);
}
