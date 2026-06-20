// ── Modal ─────────────────────────────────────────────────────────────────────
function modal(title, body) {
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="modal-card"><div class="modal-head"><div><h2>${title}</h2><p>BlockBoss CRM</p></div><button class="close-btn" data-action="closeModal">Close</button></div>${body}</div>`;
  m.classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }

// ── Lead Sheet ────────────────────────────────────────────────────────────────
function openLead(id) {
  const l = state.leads.find(x => x.id === id);
  if (!l) return;
  currentLeadId = id;
  document.getElementById('shName').textContent = nameOf(l) + (l.joint && l.coowner ? ` + ${l.coowner}` : '') + (l.hpd_enriched ? ' 🔓' : l.acris_owner_names?.length ? ' 📜' : l.entity ? ' 🏢' : l.needs_verify ? ' 🔍' : '');
  const addrEl = document.getElementById('shAddr');
  addrEl.textContent = [l.addr, l.boro, l.zip].filter(Boolean).join(', ');
  if (l.phone) addrEl.innerHTML = addrEl.textContent + `<a href="tel:${digits(l.phone)}" style="color:var(--blue);margin-left:8px;font-size:12px;font-weight:700">📞 ${esc(l.phone)}</a>`;
  const q = leadQuality(l), ss = sunScore(l);
  const nextDoor=nextDoorLead(l);
  document.getElementById('sheetBody').innerHTML = `
${!['closed','not_interested','do_not_knock','not_qualified'].includes(l.status)?`<button class="save-btn blue" style="font-size:16px;letter-spacing:.3px;margin-bottom:14px" data-lead-action="knockNow">✊ At the Door</button>`:''}
${nextDoor?`<div class="next-door-hint">🏠 Same-side next: <b>${esc(nextDoor.addr)}</b></div>`:''}
<div class="pipeline-mini"><span class="${q>=70?'hot':''}">Q${q} Lead Quality</span><span class="${ss>=75?'hot':''}">☀️ ${ss} Sun Score</span><span>👤 ${esc(l.assigned_agent||'Unassigned')}</span><span>📍 ${esc(l.territory||l.boro||'No territory')}</span><span>${esc(l.source||'manual')}</span>${ownerConfidenceBadge(l)}${syncBadgeHTML(l)}</div>
${(()=>{const c=ownerConfidence(l);return `<div class="owner-confidence ${c.level}"><b>${esc(c.label)}</b><span>${esc(c.source)}${c.age<99999?` · ${c.age} days old`:''}</span></div>`;})()}
<div class="sun-score-card"><div class="sun-score-top"><div><div class="sun-score-title">☀️ Free Sun Potential Score</div><div class="sun-score-reason">Ranks leads using property, bill, roof, solar/HVAC, and status.</div></div><div class="sun-score-num">${ss}</div></div><div class="sun-score-bar"><div class="sun-score-fill" style="width:${ss}%"></div></div><div class="sun-score-reason"><b>${q>=75?'High Priority':q>=50?'Medium Priority':'Low Priority'}</b> · Lead quality ${q}/100${l.nrel_ghi?` · ☀ ${(+l.nrel_ghi).toFixed(1)} kWh/m²/day`:''}</div></div>
<div class="action-grid"><a class="save-btn blue" style="text-decoration:none;text-align:center" href="${l.phone?'tel:'+digits(l.phone):'#'}">📞 Call</a><a class="save-btn secondary" style="text-decoration:none;text-align:center" href="${l.phone?'sms:'+digits(l.phone):'#'}">💬 Text</a><a class="save-btn gold" style="text-decoration:none;text-align:center" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((l.addr||'')+' '+(l.boro||'')+' NY '+(l.zip||''))}">🧭 Directions</a><button class="save-btn purple" data-lead-action="handoff">📲 Closer</button></div>
<div class="quick-disp">${DISP.map(d=>`<button class="qd-btn ${l.status===d[0]?'current':''}" data-disp="${d[0]}"><div class="qd-ico">${d[1]}</div><div class="qd-label">${d[2]}</div></button>`).join('')}</div>
<details class="clean" open><summary>👤 Customer / Sales Info</summary><div class="inner"><div class="form-grid-2"><div class="form-row"><label>First</label><input id="fFirst" value="${esc(l.first||'')}"></div><div class="form-row"><label>Last</label><input id="fLast" value="${esc(l.last||'')}"></div></div><div class="form-grid-2"><div class="form-row"><label>Phone</label><input id="fPhone" value="${esc(l.phone||'')}"></div><div class="form-row"><label>Email</label><input id="fEmail" value="${esc(l.email||'')}"></div></div><div class="form-grid-2"><div class="form-row"><label>Monthly Electric Bill</label><input type="number" id="fBill" value="${esc(l.monthly_bill||'')}"></div><div class="form-row"><label>Credit</label><select id="fCredit"><option>unknown</option><option>720+</option><option>680-720</option><option>640-680</option><option>below 640</option></select></div></div><div class="form-grid-2"><div class="form-row"><label>Assigned Agent</label><input id="fAgent" value="${esc(l.assigned_agent||'')}"></div><div class="form-row"><label>Territory</label><input id="fTerritory" value="${esc(l.territory||l.boro||'')}"></div></div></div></details>
<details class="clean"><summary>☀️ Solar + HVAC Qualification</summary><div class="inner"><div class="form-grid-2"><div class="form-row"><label>Solar Status</label><select id="fSolar"><option value="unknown">Unknown</option><option value="no_solar_visible">No Solar Visible</option><option value="has_solar">Has Solar</option><option value="good_roof">Good Roof</option><option value="shaded_roof">Shaded Roof</option><option value="needs_bill">Needs Bill</option></select></div><div class="form-row"><label>Heating Type</label><select id="fHeat"><option value="unknown">Unknown</option><option value="gas_boiler">Gas Boiler</option><option value="oil_boiler">Oil Boiler</option><option value="steam">Steam</option><option value="window_ac">Window AC</option><option value="heat_pump">Already Heat Pump</option></select></div></div><div class="form-row"><label>HVAC Opportunity</label><input id="fHVAC" value="${esc(l.hvac_opportunity||'')}" placeholder="mini split, boiler replacement, high heating bill"></div><div class="form-grid-2"><div class="form-row"><label>Gas/Oil Bill</label><input type="number" id="fHeatBill" value="${esc(l.heating_bill||'')}"></div><div class="form-row"><label>Bill Upload / File Name</label><input id="fBillFile" value="${esc(l.bill_file_name||'')}" placeholder="bill.pdf"></div></div><div class="form-row"><label>Roof Notes</label><input id="fRoof" value="${esc(l.roof_notes||'')}"></div></div></details>
<details class="clean"><summary>📅 Follow-Up / Appointment</summary><div class="inner"><div class="form-grid-2"><div class="form-row"><label>Callback Due</label><input type="datetime-local" id="fCallback" value="${localDT(l.callback_due)}"></div><div class="form-row"><label>Appointment Time</label><input type="datetime-local" id="fAppt" value="${localDT(l.appt_time)}"></div></div><div class="form-grid-2"><div class="form-row"><label>Assigned Closer</label><input id="fCloser" value="${esc(l.assigned_closer||'')}"></div><div class="form-row"><label>Appointment Outcome</label><select id="fOutcome"><option value="none">None</option><option value="confirmed">Confirmed</option><option value="no_show">No Show</option><option value="sat">Sat</option><option value="closed">Closed</option><option value="lost">Lost</option></select></div></div></div></details>
${l.hpd_enriched?`<details class="clean" open><summary>🔓 HPD-Unmasked Owner</summary><div class="inner"><b>${esc(nameOf(l))}</b><br>Role: ${esc(l.hpd_type||'—')}<br>Owner address: ${esc([l.hpd_business_addr,l.hpd_business_city,l.hpd_business_state,l.hpd_business_zip].filter(Boolean).join(', ')||'—')}<br>Original entity: ${esc(l.original_entity_name||'—')}</div></details>`:''}
${l.acris_owner_names?.length?`<details class="clean" open><summary>📜 ACRIS Deed Owner</summary><div class="inner"><b>${esc(l.acris_owner_names.join(' & '))}</b><br>Recorded: ${esc(l.acris_recorded_at?new Date(l.acris_recorded_at).toLocaleDateString():'—')}<br>Freshness: ${esc(l.owner_freshness==='recent_deed'?'Recent deed — promoted':'Historical deed — verify')}<br>Document: ${esc(l.acris_document_id||'—')}${l.original_owner_name?`<br>Previous displayed owner: ${esc(l.original_owner_name)}`:''}</div></details>`:''}
<details class="clean"><summary>🏠 Property / PLUTO</summary><div class="inner">BBL: ${esc(l.bbl||'—')}<br>Class: ${esc(l.bldg_class||'—')}<br>Built: ${esc(l.year_built||'—')}<br>Units: ${esc(l.units||'—')}<br>Lot: ${esc(l.lot_sqft||'—')}<br>Raw owner: ${esc(l.raw_owner||'—')}</div></details>
<details class="clean"><summary>🕒 Timeline / Notes</summary><div class="inner"><div class="form-row"><label>Notes</label><textarea id="fNotes">${esc(l.notes||'')}</textarea></div>${(l.activity_log||[]).slice(0,10).map(x=>`<div class="mini-item"><div class="nm">${esc(x.note||x.type)}</div><div class="meta">${new Date(x.at).toLocaleString()} · ${esc(x.agent||'CRM')}</div></div>`).join('')||'<p class="sub">No activity yet.</p>'}</div></details>
<details class="clean"><summary>📷 Photos</summary><div class="inner"><div id="photoGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">${(l.photos||[]).map(u=>`<img src="${u}" style="width:100%;border-radius:6px;object-fit:cover;aspect-ratio:1" onclick="window.open('${u}','_blank')">`).join('')}</div><button class="save-btn secondary" onclick="document.getElementById('photoInput').click()">📷 Add Photo</button><input type="file" id="photoInput" accept="image/*" capture="environment" style="display:none" onchange="uploadPhoto(this)"></div></details>
<button class="save-btn green" data-lead-action="saveDetails">Save Details</button>
<button class="save-btn red" data-lead-action="deleteLead">Delete Lead</button>
`;
  ['fCredit','fSolar','fHeat','fOutcome'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = { fCredit:l.credit||'unknown', fSolar:l.solar_status||'unknown', fHeat:l.heating_type||'unknown', fOutcome:l.appt_outcome||'none' }[id];
  });
  document.getElementById('sheet').classList.add('open');
}
function closeSheet() { document.getElementById('sheet').classList.remove('open'); currentLeadId = null; renderMarkers(); }

// ── Lead Actions ──────────────────────────────────────────────────────────────
function addLog(l, type, note) {
  l.activity_log = l.activity_log || [];
  l.activity_log.unshift({ type, note, at:new Date().toISOString(), agent:agentName() });
  l.activity_log = l.activity_log.slice(0, 80);
  l.updated_at = new Date().toISOString();
}
function saveLeadDetails(l) {
  l.first = val('fFirst'); l.last = val('fLast'); l.phone = val('fPhone'); l.email = val('fEmail');
  l.monthly_bill = val('fBill'); l.credit = val('fCredit'); l.assigned_agent = val('fAgent');
  l.territory = val('fTerritory'); l.solar_status = val('fSolar'); l.heating_type = val('fHeat');
  l.hvac_opportunity = val('fHVAC'); l.heating_bill = val('fHeatBill'); l.bill_file_name = val('fBillFile');
  l.roof_notes = val('fRoof'); l.callback_due = val('fCallback'); l.appt_time = val('fAppt');
  l.assigned_closer = val('fCloser'); l.appt_outcome = val('fOutcome'); l.notes = val('fNotes');
  if (l.appt_outcome === 'sat') l.status = 'sat';
  if (l.appt_outcome === 'closed') l.status = 'closed';
  l.sun_score = sunScore(l);
  addLog(l, 'details', 'Details saved');
  saveState(); upsertLead(l); toast('✓ Details saved'); renderAll(); openLead(l.id);
}
function uploadPhoto(input) {
  const l = state.leads.find(x => x.id === currentLeadId);
  if (!l || !input.files[0]) { toast('No file selected'); return; }
  if (!sb || !session().team_id) { toast('Log in to upload photos'); return; }
  const file = input.files[0];
  const path = session().team_id + '/' + l.id + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  toast('Uploading photo…');
  sb.storage.from('lead-photos').upload(path, file, { upsert:true }).then(r => {
    if (r.error) { toast('Upload failed: ' + r.error.message); return; }
    const url = sb.storage.from('lead-photos').getPublicUrl(path).data.publicUrl;
    l.photos = (l.photos || []).concat([url]);
    saveState(); upsertLead(l); toast('✓ Photo saved'); openLead(l.id);
  });
}

// ── Create Lead ───────────────────────────────────────────────────────────────
function openCreate(latlng) {
  const c = latlng || map.getCenter();
  modal('➕ Add Lead', `<div class="form-grid-2"><div class="form-row"><label>First</label><input id="newFirst"></div><div class="form-row"><label>Last</label><input id="newLast"></div></div><div class="form-row"><label>Address</label><input id="newAddr"></div><div class="form-grid-2"><div class="form-row"><label>Borough / City</label><input id="newBoro" value="${settings().territory||''}"></div><div class="form-row"><label>Zip</label><input id="newZip"></div></div><div class="form-grid-2"><div class="form-row"><label>Phone</label><input id="newPhone"></div><div class="form-row"><label>Monthly Bill</label><input type="number" id="newBill"></div></div><div class="form-row"><label>Notes</label><textarea id="newNotes"></textarea></div><button class="save-btn green" data-action="createLead" data-lat="${c.lat}" data-lng="${c.lng}">Create Lead</button>`);
}
async function createLead(btn) {
  btn.disabled=true;btn.textContent='Saving lead…';
  const sess=session();
  const lead = {
    id:'m_'+Date.now(), source:'manual', status:'fresh',
    first:val('newFirst'), last:val('newLast'), addr:val('newAddr'), boro:val('newBoro'),
    zip:val('newZip'), phone:val('newPhone'), monthly_bill:val('newBill'), notes:val('newNotes'),
    lat:+btn.dataset.lat, lng:+btn.dataset.lng,
    assigned_agent:agentName(),assigned_user_email:sess.role==='agent'?(sess.email||''):'',assigned_user_id:sess.role==='agent'?(sess.user_id||sess.id||null):null,territory:settings().territory,
    updated_at:new Date().toISOString(),
    activity_log:[{type:'created',note:'Manual lead created',at:new Date().toISOString(),agent:agentName()}]
  };
  if (!lead.addr && !lead.first && !lead.last) { btn.disabled=false;btn.textContent='Create Lead';toast('Add a name or address'); return; }
  const duplicate=lead.addr?state.leads.find(x=>leadIdentityKey(x)===leadIdentityKey(lead)):null;
  if(duplicate){btn.disabled=false;btn.textContent='Create Lead';closeModal();goLead(duplicate);return toast('That property already exists');}
  if(lead.addr&&navigator.onLine){const g=await geocodePurchasedLead([lead.addr,lead.boro,lead.zip,'NY'].filter(Boolean).join(', '));if(g){lead.lat=g.lat;lead.lng=g.lng;}}
  state.leads.push(lead); saveState(); await upsertLead(lead);
  closeModal(); renderAll(); map.setView([lead.lat, lead.lng], 17); openLead(lead.id);
  toast(lead._sync_status==='synced'?'✓ Lead saved to team database':sess.team_id?'✓ Lead saved locally · cloud sync queued':'✓ Lead saved on this phone');
}

// ── Import / Export ───────────────────────────────────────────────────────────
function exportBackup() {
  const payload = { app:'BlockBoss CRM', version:'original_stack_restored', exported_at:new Date().toISOString(), state, settings:settings(), account:account(), session:session(), customer_accounts:subs(), contact:contact() };
  const arr = JSON.parse(localStorage.getItem(BACKUPS) || '[]');
  arr.unshift(payload); localStorage.setItem(BACKUPS, JSON.stringify(arr.slice(0, 6)));
  download('blockboss-crm-full-backup-' + new Date().toISOString().slice(0,10) + '.json', payload);
  toast('✓ Full backup exported');
}
function exportCSV() {
  const headers = ['Name','Address','Borough','Status','Phone','Email','Bill ($)','Sun Score','Rep','Territory','Year Built','Updated','Notes'];
  const rows = state.leads.map(l => [nameOf(l),l.addr||'',l.boro||l.borough||'',l.status||'',l.phone||'',l.email||'',l.monthly_bill||'',l.sun_score||'',l.assigned_agent||'',l.territory||'',l.yearbuilt||'',(l.updated_at||'').slice(0,10),(l.notes||'').replace(/[\r\n,]+/g,' ')].map(v => '"'+String(v).replace(/"/g,'""')+'"').join(','));
  const csv = headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'm2-leads-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('✓ Exported ' + state.leads.length + ' leads as CSV');
}
function importBackup(file) {
  if (!file) return;
  const r = new FileReader(); r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.state?.leads && !Array.isArray(d.leads)) throw Error('No leads found');
      if (!confirm('Import backup and replace local CRM data?')) return;
      state = d.state || { leads:d.leads, filter:'all' };
      if (d.settings) localStorage.setItem(SETTINGS, JSON.stringify(d.settings));
      if (d.account) localStorage.setItem(ACCOUNT, JSON.stringify(d.account));
      if (d.session) localStorage.setItem(SESSION, JSON.stringify(d.session));
      if (d.customer_accounts) localStorage.setItem(SUBS, JSON.stringify(d.customer_accounts));
      saveState(); renderAll(); toast('✓ Backup imported');
    } catch(e) { toast('Import failed: ' + e.message); }
  }; r.readAsText(file);
}
async function geocodePurchasedLead(query) {
  if (!query || query.trim().length < 5) return null;
  try {
    const r=await fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}&size=1`);
    const d=await r.json(), f=d.features?.[0];
    if(f?.geometry?.coordinates) return {lng:+f.geometry.coordinates[0],lat:+f.geometry.coordinates[1]};
  } catch(e) {}
  return null;
}
function csvColumn(headers, names) {
  for(const n of names){const i=headers.indexOf(n); if(i>=0)return i;}
  for(const n of names){const i=headers.findIndex(h=>h.includes(n)); if(i>=0)return i;}
  return -1;
}
async function importCSV(file) {
  if (!file) return;
  const text=await file.text(), rows=parseCSV(text);
  if(rows.length<2){toast('CSV empty');return;}
  const h=rows[0].map(x=>x.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')), data=rows.slice(1);
  if(!confirm(`Import ${data.length} purchased leads? Missing coordinates will be geocoded from the address.`))return;
  const col={
    first:csvColumn(h,['first_name','firstname','first']), last:csvColumn(h,['last_name','lastname','surname','last']), full:csvColumn(h,['full_name','owner_name','name','owner']),
    addr:csvColumn(h,['property_address','site_address','street_address','address_1','address','street']), city:csvColumn(h,['city','borough','boro']), zip:csvColumn(h,['zip_code','zipcode','postal_code','zip']),
    phone:csvColumn(h,['cell_phone','mobile_phone','primary_phone','phone_number','phone','mobile','cell']), email:csvColumn(h,['email_address','email']), bill:csvColumn(h,['monthly_bill','electric_bill','utility_bill','avg_bill','bill']),
    lat:csvColumn(h,['latitude','lat']), lng:csvColumn(h,['longitude','lng','lon','long']), notes:csvColumn(h,['notes','comments','remarks']), source:csvColumn(h,['lead_source','vendor','source'])
  };
  const get=(row,k)=>col[k]>=0?(row[col[k]]||'').trim():'';
  const existing=new Set(state.leads.map(leadIdentityKey));
  const prog=document.getElementById('progress'),fill=document.getElementById('progFill'),sub=document.getElementById('progSub');
  prog.classList.add('open'); document.getElementById('progTitle').textContent='Importing purchased leads…'; loadCancelled=false;
  let added=0,dupes=0,failed=0; const newLeads=[];
  for(let i=0;i<data.length;i++){
    if(loadCancelled)break; const row=data[i], addr=get(row,'addr'),zip=get(row,'zip');
    if(!addr){failed++;continue;}
    let lat=parseFloat(get(row,'lat')),lng=parseFloat(get(row,'lng'));
    if(!Number.isFinite(lat)||!Number.isFinite(lng)){const g=await geocodePurchasedLead([addr,get(row,'city'),zip,'NY'].filter(Boolean).join(', ')); if(g){lat=g.lat;lng=g.lng;} else {failed++;continue;} await new Promise(r=>setTimeout(r,180));}
    const full=get(row,'full').split(/\s+/).filter(Boolean), first=get(row,'first')||full[0]||'', last=get(row,'last')||full.slice(1).join(' ')||'Purchased Lead';
    const vendor=get(row,'source'); const lead={id:'csv_'+Date.now().toString(36)+'_'+i,source:'imported',status:'fresh',first,last,addr:title(addr),boro:get(row,'city'),zip,phone:get(row,'phone'),email:get(row,'email'),monthly_bill:get(row,'bill'),lat,lng,notes:(vendor?`[${vendor}] `:'')+get(row,'notes'),assigned_agent:'',territory:get(row,'city')||settings().territory,updated_at:new Date().toISOString()};
    const key=leadIdentityKey(lead);if(existing.has(key)){dupes++;continue;}
    state.leads.push(lead);newLeads.push(lead);existing.add(key);added++; fill.style.width=Math.round((i+1)/data.length*100)+'%'; sub.textContent=`${added} added · ${dupes} duplicates · ${failed} skipped`;
  }
  saveState();renderAll();upsertBatch(newLeads);prog.classList.remove('open');toast(`✓ Imported ${added} purchased leads`);
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (c==='"' && q && n==='"') { cur+='"'; i++; continue; }
    if (c==='"') { q=!q; continue; }
    if (c===',' && !q) { row.push(cur); cur=''; continue; }
    if ((c==='\n'||c==='\r') && !q) { if (c==='\r'&&n==='\n') i++; row.push(cur); if (row.some(x=>x.trim())) rows.push(row); row=[]; cur=''; continue; }
    cur += c;
  }
  row.push(cur); if (row.some(x=>x.trim())) rows.push(row);
  return rows;
}
