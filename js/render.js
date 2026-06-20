// ── Brand / Header ────────────────────────────────────────────────────────────
function renderBrand() {
  const s = settings(), sess = session(), b = getBilling(), act = billingActive(), plan = billingPlan();
  const _logoUrl = b.logo_url, _accent = b.accent_color, _isAgency = plan && plan.agents === 999;
  if (_isAgency && _accent) { document.documentElement.style.setProperty('--blue', _accent); document.documentElement.style.setProperty('--green', _accent); }
  if (_isAgency && _logoUrl) {
    document.getElementById('brandTitle').innerHTML = `<img src="${_logoUrl}" style="height:26px;object-fit:contain;vertical-align:middle">`;
  } else {
    document.getElementById('brandTitle').textContent = s.company || 'BlockBoss CRM';
  }
  const totalLeads = state?.leads?.length || 0, planLeads = plan?.leads || 0;
  const pct = planLeads && planLeads < 999999 ? Math.round(totalLeads / planLeads * 100) : 0;
  const meterColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--orange)' : 'var(--muted)';
  document.getElementById('sessionLine').innerHTML = `${esc(sess.name||'Master')} · ${esc(sess.role||'master')} · ${esc(s.territory||'No territory')}${act&&planLeads<999999?` <span style="margin-left:6px;color:${meterColor};font-weight:${pct>70?700:400}">${totalLeads.toLocaleString()}/${planLeads.toLocaleString()} leads</span>`:''}`;
  const existing = document.getElementById('planBadgeBtn');
  if (act && !existing) {
    const btn = document.createElement('button'); btn.id = 'planBadgeBtn'; btn.className = 'pill-btn hide-sm';
    btn.style.cssText = 'background:rgba(63,185,80,.15);border-color:rgba(63,185,80,.4);color:var(--green);font-size:10px';
    btn.textContent = (b.status==='trial'?'Trial: ':'') + (plan?.label||'Active');
    btn.setAttribute('data-action', 'openBilling');
    document.querySelector('.top-actions').insertBefore(btn, document.getElementById('openLaunch'));
  } else if (!act && existing) {
    existing.remove();
  } else if (act && existing) {
    existing.textContent = (b.status==='trial'?'Trial: ':'') + (plan?.label||'Active');
  }
}
function showVerifyBanner() {
  if (localStorage.getItem('m2_verified') || document.getElementById('verifyBanner')) return;
  const d = document.createElement('div'); d.id = 'verifyBanner';
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1a2332;border-bottom:2px solid rgba(88,166,255,.4);padding:10px 16px;display:flex;align-items:center;gap:10px;z-index:9998;font-size:13px';
  d.innerHTML = '<span style="flex:1">📧 <strong>Verify your email</strong> — check your inbox for a verification link.</span><button onclick="document.getElementById(\'verifyBanner\').remove()" style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:18px">×</button>';
  document.body.appendChild(d);
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function buildBoard(rows) {
  const b = {};
  rows.forEach(l => {
    const a = l.assigned_agent || 'Unassigned'; b[a] = b[a] || { doors:0, sets:0, closes:0 };
    if (['knocked','not_home','interested','callback','set','sat','closed'].includes(l.status)) b[a].doors++;
    if (['set','sat'].includes(l.status)) b[a].sets++;
    if (l.status === 'closed') b[a].closes++;
  });
  return Object.entries(b).sort((a, b) => b[1].closes - a[1].closes || b[1].sets - a[1].sets || b[1].doors - a[1].doors);
}
function leaderboardHTML(board) {
  if (!board.length) return '<p class="sub">No activity logged today yet.</p>';
  const medals = ['🥇','🥈','🥉'];
  return board.map(([name, s], i) => `<div class="lb-row"><div class="lb-rank">${medals[i]||'#'+(i+1)}</div><div class="lb-name">${esc(name)}</div><div class="lb-stats"><span class="badge blue">${s.doors}d</span><span class="badge hot">${s.sets}s</span><span class="badge gold">${s.closes}c</span></div></div>`).join('');
}
async function fetchLeaderboard() {
  if (sb && session().team_id) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await sb.from('leads').select('assigned_agent,status').eq('team_id', session().team_id).gte('updated_at', today+'T00:00:00');
    if (data?.length) return buildBoard(data);
  }
  const today = new Date().toDateString();
  return buildBoard(scopedLeads().filter(l => l.updated_at && new Date(l.updated_at).toDateString() === today));
}
function openLeaderboard() {
  modal('🏆 Today\'s Leaderboard', '<p class="sub" style="margin-bottom:10px">Doors knocked · Sets · Closes — live from your team.</p><div id="lbM" style="min-height:60px"><p class="sub">Loading…</p></div><div class="action-grid" style="margin-top:12px"><button class="blue" onclick="fetchLeaderboard().then(b=>{const el=document.getElementById(\'lbM\');if(el)el.innerHTML=leaderboardHTML(b)})">Refresh</button><button data-action="closeModal">Close</button></div>');
  fetchLeaderboard().then(b => { const el = document.getElementById('lbM'); if (el) el.innerHTML = leaderboardHTML(b); });
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────
function funnelHTML(leads) {
  const stages = [['Knocked',['knocked','not_home']],['Interested',['interested']],['Callback',['callback']],['Appt Set',['set']],['Sat',['sat']],['Closed',['closed']]];
  const total = Math.max(leads.filter(l => ['knocked','not_home','interested','callback','set','sat','closed'].includes(l.status)).length, 1);
  return stages.map(([label, statuses]) => {
    const n = leads.filter(l => statuses.includes(l.status)).length, pct = Math.round(n / total * 100);
    return `<div class="funnel-row"><div class="funnel-label">${label}</div><div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(pct,3)}%"></div></div><div class="funnel-num">${n} <span style="color:var(--muted);font-size:9px">${pct}%</span></div></div>`;
  }).join('');
}

// ── Stats View ────────────────────────────────────────────────────────────────
function renderAgents(agents) {
  return agents.map(a => `<div class="agent-row"><div class="nm">${esc(a.name)} <span class="badge purple">Agent</span></div><div class="meta">${esc(a.email)} · ${esc(a.territory||'No territory')} · PIN: ${esc(a.pin)}</div><div class="row"><button class="pill-btn blue" data-action="loginAsAgent" data-id="${esc(a.id)}">Login View</button><button class="pill-btn gold" data-action="assignAgent" data-id="${esc(a.id)}">Assign Visible</button></div></div>`).join('') || '<p class="sub">No agent logins created yet.</p>';
}
function renderCustomers(list) {
  return list.slice(0, 8).map(c => `<div class="mini-item"><div class="nm">${esc(c.customer||'Customer')} <span class="badge ${String(c.status).toLowerCase()==='active'?'hot':'gold'}">${esc(c.status||'Trial')}</span></div><div class="meta">${esc(c.plan||'Trial')} · $${esc(c.price||0)}/mo · Trial end: ${esc(c.trial_end||'—')}</div></div>`).join('') || '<p class="sub">No customer accounts tracked yet.</p>';
}
function renderChecklist(chk, leads, acc) {
  const tests = [
    ['Master / login session', !!session(), 'OK'],
    ['Leads loaded', leads.length > 0, leads.length + ' leads'],
    ['Agent account exists', (acc.agents||[]).length > 0, (acc.agents||[]).length + ' agents'],
    ['Assigned leads exist', leads.some(l => l.assigned_agent || l.assigned_user_email), leads.filter(l => l.assigned_agent || l.assigned_user_email).length + ' assigned'],
    ['Map ready', !!map, 'Leaflet'],
    ['Big icon dispositions', true, 'Restored'],
    ['Customer accounts', true, 'Restored'],
    ['App install checked', !!chk.install, chk.install ? 'Marked' : 'Not marked'],
    ['Sales demo checked', !!chk.demo, chk.demo ? 'Marked' : 'Not marked']
  ];
  return `<div class="m2-beta-list">${tests.map(t => `<div class="mini-item"><div class="row" style="justify-content:space-between"><div class="nm">${esc(t[0])}</div><span class="badge ${t[1]?'hot':'red'}">${esc(t[2])}</span></div></div>`).join('')}</div>`;
}
function renderContact() {
  const c = contact();
  return `<div class="metric-grid"><div class="metric"><div class="k">Name</div><div class="v" style="font-size:14px">${esc(c.name||'')}</div></div><div class="metric"><div class="k">Email</div><div class="v" style="font-size:12px">${esc(c.email||'')}</div></div><div class="metric"><div class="k">Phone</div><div class="v" style="font-size:14px">${esc(c.phone||'')}</div></div><div class="metric"><div class="k">CTA</div><div class="v" style="font-size:12px">${esc(c.cta||'')}</div></div></div>`;
}

function renderStats() {
  const s = document.getElementById('statsView'), leads = scopedLeads(), today = todayLeads();
  const hot = leads.filter(l => leadQuality(l) >= 70), due = leads.filter(isDue);
  const acc = account(), b = settings(), list = subs(), chk = checks();
  const sales = document.body.classList.contains('sales-demo-on');

  // Closer Board — sorted by appt time
  const closerBoard = (() => {
    const sl = scopedLeads().filter(l => l.status === 'set').sort((a, b) => {
      const ta = a.appt_time ? new Date(a.appt_time) : new Date(9e15);
      const tb = b.appt_time ? new Date(b.appt_time) : new Date(9e15);
      return ta - tb;
    });
    if (!sl.length) return '<p class="sub" style="padding:8px 0">No appointments set yet. When a rep marks a lead as Appointment Set it appears here.</p>';
    return '<div style="margin-bottom:10px;font-size:12px;color:var(--muted)">' + sl.length + ' appointment' + (sl.length===1?'':'s') + ' set</div>' +
      sl.map(l => {
        const dt = l.appt_time ? new Date(l.appt_time).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'No time set';
        const bill = l.monthly_bill ? '$'+l.monthly_bill+'/mo' : '';
        const hvac = l.hvac_opportunity || (l.heating_type && l.heating_type !== 'unknown' ? l.heating_type : '');
        return `<div class="mini-item" style="cursor:pointer" onclick="openLead('${l.id}')"><div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><div class="nm">${esc(nameOf(l))}</div><span class="badge purple" style="font-size:10px;white-space:nowrap">${esc(dt)}</span></div><div class="meta">${esc(l.addr||'')}${bill?' · '+bill:''}${hvac?' · 🔧 '+esc(hvac):''}${l.assigned_closer?' · Closer: '+esc(l.assigned_closer):''}</div>${l.phone?`<a href="tel:${l.phone.replace(/\D/g,'')}" style="color:var(--blue);font-size:12px;font-weight:600;display:inline-block;margin-top:4px" onclick="event.stopPropagation()">📞 ${esc(l.phone)}</a>`:''}</div>`;
      }).join('');
  })();

  s.innerHTML = `
${sales?`<div class="sales-banner"><span>🎬 Sales Demo Mode is ON</span><button data-action="salesOff">Exit</button></div>`:''}
<div class="card"><h3>📊 CRM Command Center</h3><p class="sub">Original stack restored: map, PLUTO owner pins, master login, rep mode, customer accounts, beta launch tools, big icon dispositions.</p><div class="metric-grid">
<div class="metric"><div class="k">Leads</div><div class="v">${leads.length}</div></div><div class="metric"><div class="k">Hot</div><div class="v">${hot.length}</div></div><div class="metric"><div class="k">Today Doors</div><div class="v">${today.filter(l=>['knocked','not_home','interested','callback','set','sat','closed'].includes(l.status)).length}</div></div><div class="metric"><div class="k">Follow-ups</div><div class="v">${due.length}</div></div></div><div class="action-grid"><button class="green" data-action="repMode">🚶 Rep Mode</button><button class="gold" data-action="nextBest">🎯 Next Best</button><button class="blue" data-action="openFollowups">📅 Follow-Ups</button><button class="blue" data-action="territoryProgress">📊 Territory Progress</button><button class="purple" data-action="enablePush">${localStorage.getItem('m2_push_enabled')?'✓ Push Alerts':'🔔 Enable Push'}</button>${isMaster()?'<button class="purple" data-action="managerAudit">🛡️ Manager Audit</button><button class="gold" data-action="duplicateManager">🧬 Merge Duplicates</button><button class="blue" data-action="healthDashboard">🩺 Production Health</button>':''}<button class="blue" data-action="openLaunch">🚀 Launch Screen</button><button data-action="toggleSales">🎬 Sales Demo</button></div></div>
<div class="card"><h3>🏆 Today's Leaderboard</h3><p class="sub">Doors knocked · Sets · Closes per rep today.</p><div id="lbContent"><p class="sub">Loading…</p></div></div>
<div class="card" style="border-color:rgba(161,113,247,.3)"><h3>📋 Closer Board</h3><p class="sub">All appointments set — sorted by time. Send to your closer before each sit.</p>${closerBoard}</div>
<div class="card"><h3>📊 Conversion Funnel</h3><p class="sub">Pipeline breakdown across all loaded leads.</p>${funnelHTML(leads)}</div>
<div class="card"><h3>🔐 Account Access</h3><p class="sub">Master / manager / agent login. Agents only see assigned leads when logged in as agent.</p><div class="metric-grid"><div class="metric"><div class="k">Session</div><div class="v" style="font-size:15px">${esc(session().role||'master')}</div></div><div class="metric"><div class="k">User</div><div class="v" style="font-size:15px">${esc(agentName())}</div></div><div class="metric"><div class="k">Agents</div><div class="v">${(acc.agents||[]).length}</div></div><div class="metric"><div class="k">Assigned</div><div class="v">${leads.filter(l=>l.assigned_agent||l.assigned_user_email).length}</div></div></div><div class="action-grid"><button class="blue" data-action="openLogin">Open Login</button><button class="green" data-action="openAgentSetup">Create Agent Login</button><button class="gold" data-action="assignVisible">Assign Visible Leads</button><button class="purple" data-action="openSMSBlast">📱 SMS Blast</button><button data-action="logout">Log Out / Switch</button></div>${renderAgents(acc.agents||[])}</div>
<div class="card"><h3>👥 Customer Accounts</h3><p class="sub">Track beta customers, plan, trial/payment status, limits, and notes before Stripe.</p><div class="metric-grid"><div class="metric"><div class="k">Accounts</div><div class="v">${list.length}</div></div><div class="metric"><div class="k">Active</div><div class="v">${list.filter(x=>String(x.status).toLowerCase()==='active').length}</div></div><div class="metric"><div class="k">Trial</div><div class="v">${list.filter(x=>String(x.status).toLowerCase()==='trial').length}</div></div><div class="metric"><div class="k">Plan</div><div class="v" style="font-size:15px">${esc(b.plan||'Growth')}</div></div></div>${renderCustomers(list)}<div class="action-grid"><button class="green" data-action="openCustomer">Add / Update Customer</button><button class="gold" data-action="copyPlan">Copy Account Summary</button></div></div>
<div class="card"><h3>🧪 Test Mode Checklist</h3><p class="sub">Run this before using real reps or showing a beta customer.</p>${renderChecklist(chk,leads,acc)}<div class="action-grid"><button class="green" data-action="runTest">Run Full Test</button><button class="gold" data-action="exportBackup">Export Backup First</button><button data-action="copyChecklist">Copy Checklist</button><button data-action="markInstall">Mark App Installed</button></div></div>
<div class="card"><h3>📲 Book Demo / Contact Setup</h3><p class="sub">Set demo contact info and copy pitch/follow-up text fast.</p>${renderContact()}<div class="action-grid"><button class="green" data-action="openContact">Edit Contact Info</button><button class="blue" data-action="copyPitch">Copy Pitch</button><button class="gold" data-action="copyFollowup">Copy Follow-up</button><button data-action="copyContact">Copy Contact Card</button></div></div>
<div class="card" style="border-color:${billingActive()?'#3fb95044':'#1f6feb44'}"><h3>💳 Billing & Plan</h3><p class="sub">${billingActive()?`<span style="color:var(--green);font-weight:900">✓ ${esc(billingPlan()?.label||'Active')} plan${getBilling().status==='trial'?' (Trial)':''}</span>${getBilling().period_end?' · Renews '+esc(getBilling().period_end):''}`:getBilling().plan_key?'Plan status unknown — check billing portal':'No active plan — start a trial or subscribe.'}</p><div class="metric-grid"><div class="metric"><div class="k">Plan</div><div class="v" style="font-size:14px">${esc(billingPlan()?.label||'None')}</div></div><div class="metric"><div class="k">Status</div><div class="v" style="font-size:14px;color:${billingActive()?'var(--green)':'var(--red)'}">${esc(getBilling().status||'none')}</div></div><div class="metric"><div class="k">Reps</div><div class="v">${billingPlan()?.agents===999?'∞':esc(billingPlan()?.agents||'—')}</div></div><div class="metric"><div class="k">Renews</div><div class="v" style="font-size:12px">${esc(getBilling().period_end||'—')}</div></div></div><div class="action-grid"><button class="green" data-action="openBilling">Upgrade / Plans</button><button class="blue" data-action="activateTrial">Start Free Trial</button><button class="gold" data-action="openBillingPortal">Billing Portal</button><button data-action="pricing">Pricing Preview</button></div></div>
<div class="card"><h3>🌐 Landing Screen Polish</h3><p class="sub">A clean public-style screen for prospects before login.</p><div class="action-grid"><button class="green" data-action="landingPreview">Open Landing Preview</button><button data-action="copyLanding">Copy Landing Text</button><button class="gold" data-action="pricing">Pricing</button><button class="blue" data-action="valueCalc">Value Calculator</button></div></div>
<div class="card" style="border-color:rgba(63,185,80,.3)"><h3>🛡️ Automated Maintenance</h3><p class="sub">Daily encrypted backups at 3:15 AM · 1,000 stale homeowner records refreshed nightly at 4:00 AM.</p><div id="maintenanceContent"><p class="sub">Loading maintenance history…</p></div><div class="action-grid"><button class="green" data-action="runBackupNow">Back Up Now</button><button class="blue" data-action="runOwnerRefresh">Refresh 1,000 Owners</button></div></div>
<div class="card internal-hide"><h3>⚙️ Settings</h3><div class="form-grid-2"><div class="form-row"><label>CRM / Company Name</label><input id="cfgCompany" value="${esc(b.company||'BlockBoss CRM')}"></div><div class="form-row"><label>Agent Name</label><input id="cfgAgent" value="${esc(b.agent_name||'Shaquille')}"></div></div><div class="form-grid-2"><div class="form-row"><label>Territory</label><input id="cfgTerritory" value="${esc(b.territory||'Queens / Long Island')}"></div><div class="form-row"><label>Plan</label><select id="cfgPlan"><option>Trial</option><option>Starter</option><option>Growth</option><option>Office</option></select></div></div><div class="form-grid-2"><div class="form-row"><label>Daily Door Goal</label><input type="number" id="cfgDoor" value="${b.door_goal||25}"></div><div class="form-row"><label>Daily Appointment Goal</label><input type="number" id="cfgAppt" value="${b.appt_goal||2}"></div></div><label class="row" style="margin-top:10px"><input type="checkbox" id="cfgLLC" ${b.include_llc!==false?'checked':''}> <span class="sub">Include LLC / Trust owners in PLUTO loads</span></label><label class="row" style="margin-top:8px"><input type="checkbox" id="cfgVerify" ${b.allow_verify!==false?'checked':''}> <span class="sub">Include borderline owner records</span></label><button class="save-btn purple" data-action="saveSettings">Save Settings</button><div style="height:1px;background:var(--border);margin:14px 0"></div><h3>🔓 Free Owner-Name Enrichment</h3><p class="sub">Cross-reference LLC and uncertain PLUTO records with NYC HPD's public owner registry.</p><div class="action-grid"><button class="green" data-action="hpdView">HPD · Current View</button><button class="blue" data-action="hpdAll">HPD · All LLC Leads</button><button class="gold" data-action="acrisView">ACRIS · Current View</button><button data-action="acrisAll">ACRIS · All BBL Leads</button></div><p class="sub" style="margin-top:8px">HPD unmasks registered LLC contacts. ACRIS checks the latest recorded deed buyers and marks freshness. Results are cached for 30 days.</p></div>
<div class="card" style="border-color:rgba(63,185,80,.3)"><h3>🎁 Referral Program</h3><p class="sub">Share your link. Earn <strong style="color:var(--green)">$50 credit</strong> for every team that signs up through it.</p><div id="refBlock"><p class="sub">${getBilling().referral_code?`Code: ${esc(getBilling().referral_code)} · Credits: ${esc(getBilling().referral_credits||0)}`:'Log in to generate your referral code.'}</p></div><button class="save-btn" data-action="copyReferral">Copy My Referral Link</button></div>
<div class="card" style="border-color:rgba(161,113,247,.3)"><h3>🎨 White-Label Branding</h3><p class="sub">Agency plan only — customize your team's CRM with your own logo and brand color.</p><div id="wlBlock"><p class="sub" style="font-size:12px">Available on Agency plan ($349/mo)</p></div><button class="save-btn purple" data-action="openBranding">Customize Branding</button></div>
<div class="card internal-hide"><h3>📥 Import / Export / Backup</h3><p class="sub">Safe backups before big changes. CSV import supports name, address, phone, email, bill, lat/lng.</p><div class="action-grid"><button class="gold" data-action="exportBackup">Export Full Backup</button><label class="blue">Import Backup<input type="file" id="backupFile" accept=".json,application/json" style="display:none"></label><label class="green">Import CSV<input type="file" id="csvFile" accept=".csv,text/csv" style="display:none"></label><button class="red" data-action="resetData">Reset Data</button></div></div>
`;
  const plan = document.getElementById('cfgPlan');
  if (plan) plan.value = b.plan || 'Growth';
  setTimeout(async () => {
    const board = await fetchLeaderboard();
    const el = document.getElementById('lbContent');
    if (el) el.innerHTML = leaderboardHTML(board);
  }, 60);
  setTimeout(refreshMaintenancePanel, 100);
}

// ── Lead List ─────────────────────────────────────────────────────────────────
function renderList() {
  const c = document.getElementById('listContainer');
  const arr = filterLeads().slice().sort((a, b) => leadQuality(b) - leadQuality(a));
  if (!arr.length) { c.innerHTML = '<div class="card"><h3>No leads yet</h3><p class="sub">Use Field Tools → Load Area, Neighborhoods, Add Lead, or import CSV.</p></div>'; return; }
  c.innerHTML = arr.slice(0, 700).map(l => `<div class="lead-item" data-id="${l.id}"><div class="nm">${esc(nameOf(l))} ${l.hpd_enriched?'🔓':l.acris_owner_names?.length?'📜':l.entity?'🏢':''}</div><div class="ad">${esc(l.addr||'')} ${l.boro?`· ${esc(l.boro)}`:''}</div><div class="row"><span class="badge ${statusBadge(l.status)}">${LABEL[l.status||'fresh']}</span><span class="badge gold">☀ ${sunScore(l)}</span><span class="badge blue">Q${leadQuality(l)}</span>${ownerConfidenceBadge(l)}${syncBadgeHTML(l)}${l.assigned_agent?`<span class="badge hot">👤 ${esc(l.assigned_agent)}</span>`:''}</div></div>`).join('');
  c.querySelectorAll('.lead-item').forEach(i => i.onclick = () => {
    const l = state.leads.find(x => x.id === i.dataset.id);
    window._blockWalkDirection=1;
    switchView('map'); if (l.lat && l.lng) map.setView([+l.lat, +l.lng], 18);
    setTimeout(() => openLead(l.id), 180);
  });
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function renderAll() { renderBrand(); renderFilter(); renderMarkers(); renderList(); renderStats(); }
function switchView(v) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.getElementById('listView').classList.toggle('open', v === 'list');
  document.getElementById('statsView').classList.toggle('open', v === 'stats');
  if (v === 'list') renderList();
  if (v === 'stats') renderStats();
  setTimeout(() => map.invalidateSize(), 80);
}
