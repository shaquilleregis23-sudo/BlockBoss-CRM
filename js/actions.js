// ── Utility Modal Actions ─────────────────────────────────────────────────────
function openCustomer() {
  modal('👥 Add / Update Customer Account', `<div class="form-grid-2"><div class="form-row"><label>Customer / Company</label><input id="custName"></div><div class="form-row"><label>Plan</label><select id="custPlan"><option>Trial</option><option>Starter</option><option>Growth</option><option>Office</option></select></div></div><div class="form-grid-2"><div class="form-row"><label>Status</label><select id="custStatus"><option>Trial</option><option>Active</option><option>Past Due</option><option>Canceled</option></select></div><div class="form-row"><label>Price</label><input type="number" id="custPrice" value="199"></div></div><div class="form-row"><label>Trial End</label><input type="date" id="custEnd"></div><div class="form-row"><label>Notes</label><textarea id="custNotes"></textarea></div><button class="save-btn green" data-action="saveCustomer">Save Customer</button>`);
}
function saveCustomer() {
  const list = subs(), item = { customer:val('custName')||'Customer', plan:val('custPlan'), status:val('custStatus'), price:val('custPrice'), trial_end:val('custEnd'), notes:val('custNotes'), updated_at:new Date().toISOString() };
  const idx = list.findIndex(x => x.customer.toLowerCase() === item.customer.toLowerCase());
  if (idx >= 0) list[idx] = item; else list.unshift(item);
  saveSubs(list); closeModal(); renderStats(); toast('✓ Customer saved');
}
function openContact() {
  const c = contact();
  modal('📲 Book Demo Contact Setup', `<div class="form-grid-2"><div class="form-row"><label>Name</label><input id="ctName" value="${esc(c.name||'')}"></div><div class="form-row"><label>Phone</label><input id="ctPhone" value="${esc(c.phone||'')}"></div></div><div class="form-row"><label>Email</label><input id="ctEmail" value="${esc(c.email||'')}"></div><div class="form-row"><label>Booking Link</label><input id="ctBooking" value="${esc(c.booking||'')}"></div><div class="form-row"><label>CTA</label><textarea id="ctCTA">${esc(c.cta||'')}</textarea></div><button class="save-btn green" data-action="saveContact">Save Contact</button>`);
}
function saveContactForm() { saveContact({ name:val('ctName'), phone:val('ctPhone'), email:val('ctEmail'), booking:val('ctBooking'), cta:val('ctCTA') }); closeModal(); renderStats(); toast('✓ Contact saved'); }
function saveSettingsForm() {
  saveSettings({ company:val('cfgCompany'), agent_name:val('cfgAgent'), territory:val('cfgTerritory'), plan:val('cfgPlan'), door_goal:val('cfgDoor'), appt_goal:val('cfgAppt'), include_llc:document.getElementById('cfgLLC').checked, allow_verify:document.getElementById('cfgVerify').checked });
  toast('✓ Settings saved'); renderStats();
}
function copyReferralLink() {
  const b=getBilling(), code=b.referral_code;
  if(!code) return toast('Log in to see your referral link');
  copyText(`${location.origin}${location.pathname}?ref=${code}`, 'Referral link copied');
}
function openBranding() {
  const b=getBilling(), plan=billingPlan();
  if(!plan || plan.agents<999) return toast('White-label is an Agency plan feature');
  modal('🎨 White-Label Branding', `<div class="form-row"><label>Logo URL</label><input id="wlLogo" placeholder="https://yourcompany.com/logo.png" value="${esc(b.logo_url||'')}"></div><div class="form-row"><label>Accent Color</label><input id="wlColor" type="color" value="${esc(b.accent_color||'#58a6ff')}"></div><button class="save-btn blue" data-action="saveBranding">Save Branding</button>`);
}
function saveBrandingForm() {
  const logo=val('wlLogo').trim(), color=val('wlColor');
  saveBilling({logo_url:logo,accent_color:color}); renderBrand(); closeModal(); toast('✓ Branding saved locally');
  if(sb && session().email) sb.from('master_accounts').update({logo_url:logo,accent_color:color}).eq('email',session().email);
}
function pricing() {
  modal('💳 BlockBoss CRM Pricing', `<div class="metric-grid"><div class="metric"><div class="k">Starter</div><div class="v">$99</div><p class="sub">3 agents · 2,500 leads</p></div><div class="metric"><div class="k">Growth</div><div class="v">$199</div><p class="sub">10 agents · 10k leads</p></div><div class="metric"><div class="k">Office</div><div class="v">$299</div><p class="sub">25 agents · 50k leads</p></div><div class="metric"><div class="k">Setup</div><div class="v">$499</div><p class="sub">Optional onboarding</p></div></div><button class="save-btn green" data-action="openCustomer">Track Customer</button>`);
}
function valueCalc() {
  modal('📈 CRM Value Calculator', `<div class="form-grid-2"><div class="form-row"><label>Agents</label><input type="number" id="vcAgents" value="5"></div><div class="form-row"><label>Leads / agent / week</label><input type="number" id="vcLeads" value="60"></div></div><div class="form-grid-2"><div class="form-row"><label>Close Value $</label><input type="number" id="vcValue" value="4500"></div><div class="form-row"><label>Close Rate %</label><input type="number" id="vcRate" value="5"></div></div><button class="save-btn green" data-action="calcValue">Calculate</button><div id="vcResult" class="card" style="margin-top:12px"></div>`);
  calcValue();
}
function calcValue() {
  const a=+val('vcAgents')||0, l=+val('vcLeads')||0, v=+val('vcValue')||0, r=(+val('vcRate')||0)/100;
  const opp=a*l*4, deals=opp*r, rev=deals*v;
  document.getElementById('vcResult').innerHTML = `<h3>Monthly Impact</h3><div class="metric-grid"><div class="metric"><div class="k">Opps</div><div class="v">${Math.round(opp)}</div></div><div class="metric"><div class="k">Deals</div><div class="v">${deals.toFixed(1)}</div></div><div class="metric"><div class="k">Revenue</div><div class="v">$${Math.round(rev).toLocaleString()}</div></div><div class="metric"><div class="k">CRM Cost</div><div class="v">$199</div></div></div>`;
}
function landingPreview() {
  const c = contact();
  modal('🌐 Landing Preview', `<div style="background:radial-gradient(circle at 20% 10%,rgba(42,255,194,.22),transparent 36%),linear-gradient(135deg,#06111f,#082f36);border:1px solid rgba(42,255,194,.25);border-radius:24px;padding:22px;color:#fff"><span class="badge hot">Solar • HVAC • Clean Heat</span><h1 style="font-size:32px;margin:10px 0 8px">${esc(settings().company||'BlockBoss CRM')}</h1><p class="sub" style="color:#c8f7f1">Smart map, PLUTO homeowner names, sun score, big dispositions, rep mode, customer accounts, manager dashboard, backups, and sales demo tools.</p><div class="action-grid"><button class="green" data-action="demoMode">Try Demo</button><button class="gold" data-action="pricing">Pricing</button><button class="blue" data-action="openLogin">Login</button></div><div class="metric-grid" style="margin-top:12px"><div class="metric"><div class="k">Contact</div><div class="v" style="font-size:14px">${esc(c.name||'')}</div></div><div class="metric"><div class="k">Email</div><div class="v" style="font-size:12px">${esc(c.email||'')}</div></div><div class="metric"><div class="k">Phone</div><div class="v" style="font-size:14px">${esc(c.phone||'')}</div></div><div class="metric"><div class="k">CTA</div><div class="v" style="font-size:12px">${esc(c.cta||'')}</div></div></div></div>`);
}
function launch() {
  modal('🚀 BlockBoss CRM Launch Screen', `<p class="sub">Choose how to enter the CRM.</p><div class="action-grid"><button class="blue" data-action="openLogin">👑 Master / Agent Login</button><button class="green" data-action="demoMode">🚀 Try Demo Mode</button><button class="gold" data-action="openLeaderboard">🏆 Leaderboard</button><button data-action="exportCSV">📊 Export CSV</button><button data-action="landingPreview">🌐 Landing Preview</button><button data-action="openCustomer">👥 Customer Setup</button></div>`);
}
function repMode() {
  const l = nextBestLead(), leads = scopedLeads(), due = leads.filter(isDue), hot = leads.filter(x => leadQuality(x) >= 70);
  modal('🚶 Rep Mode', `<p class="sub">Simple field workflow: route, next lead, follow-up, update, repeat.</p><div class="metric-grid"><div class="metric"><div class="k">Next Best</div><div class="v" style="font-size:14px">${esc(l?nameOf(l):'None')}</div></div><div class="metric"><div class="k">Quality</div><div class="v">${l?leadQuality(l):0}</div></div><div class="metric"><div class="k">Due</div><div class="v">${due.length}</div></div><div class="metric"><div class="k">Hot</div><div class="v">${hot.length}</div></div></div><div class="action-grid"><button class="green" data-action="nextBest">Open Next Best</button><button class="blue" data-action="locate">Locate Me</button><button class="gold" data-action="fitLeads">Fit Leads</button><button data-action="switchList">Lead List</button></div><h3 style="margin-top:14px">Follow-ups</h3>${due.slice(0,8).map(x=>`<div class="mini-item" data-open="${x.id}"><div class="nm">${esc(nameOf(x))}</div><div class="meta">${esc(x.addr||'')} · ${esc(x.callback_due||x.appt_time||'')}</div></div>`).join('')||'<p class="sub">No follow-ups due.</p>'}`);
}
function runTest() {
  const problems = [];
  if (!session()) problems.push('login');
  if (!state.leads.length) problems.push('leads');
  if (!(account().agents||[]).length) problems.push('agents');
  if (!map) problems.push('map');
  toast(problems.length ? 'Check: ' + problems.join(', ') : '✓ Test Mode passed. CRM is demo-ready.');
}

// ── Main Action Dispatcher ────────────────────────────────────────────────────
function parseAction(e) {
  const a = e.target.closest('[data-action], [data-tool], [data-disp], [data-after], [data-lead-action], [data-open], [data-login-role], [data-agent-tab]');
  if (!a) return;
  const act = a.dataset.action || a.dataset.tool || a.dataset.leadAction;
  e.preventDefault(); e.stopPropagation();

  if (a.dataset.loginRole) {
    window._loginRole = a.dataset.loginRole;
    document.querySelectorAll('[data-login-role]').forEach(b => b.classList.toggle('active', b === a));
    const ls = document.getElementById('loginSection'), ss = document.getElementById('signupSection');
    if (ls && ss) { const su = a.dataset.loginRole === 'signup'; ls.style.display = su ? 'none' : ''; ss.style.display = su ? '' : 'none'; }
    return;
  }
  if (a.dataset.agentTab) {
    document.querySelectorAll('[data-agent-tab]').forEach(b => b.classList.toggle('active', b === a));
    const m = document.getElementById('agManual'), i = document.getElementById('agInvite');
    if (m && i) { const inv = a.dataset.agentTab === 'invite'; m.style.display = inv ? 'none' : ''; i.style.display = inv ? '' : 'none'; }
    return;
  }
  if (a.dataset.after) {
    localStorage.setItem(AFTER, a.dataset.after);
    document.querySelectorAll('[data-after]').forEach(b => b.classList.toggle('active', b === a));
    toast('After action updated'); return;
  }

  // Disposition tap
  if (a.dataset.disp) {
    const l = state.leads.find(x => x.id === currentLeadId); if (!l) return;
    l.status = a.dataset.disp; l.sun_score = sunScore(l);
    addLog(l, a.dataset.disp, `${LABEL[a.dataset.disp]} saved`);
    saveState(); upsertLead(l);
    if (window.posthog) posthog.capture('lead_status_changed', { status:l.status, addr:l.addr });
    // Appointment confirmation SMS/email
    if (l.status === 'set' && (l.phone || l.email) && sb && session().team_id) {
      const _sg = settings();
      fetch(SB_URL + '/functions/v1/send-appt-confirm', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ lead_phone:l.phone||'', lead_email:l.email||'', lead_name:(l.first||'')+' '+(l.last||''), lead_addr:l.addr||'', rep_name:agentName(), appt_time:l.appt_time||'', company_name:_sg.company||'BlockBoss CRM' }) }).catch(() => {});
    }
    a.classList.add('saved'); a.innerHTML = '<div class="qd-ico">✓</div><div class="qd-label">Saved</div>';
    toast(`✓ ${LABEL[l.status]}`); renderAll();
    const after = localStorage.getItem(AFTER) || 'next';
    if (after === 'next') setTimeout(() => { closeSheet(); goLead(nextBestLead()); }, 420);
    else if (after === 'close') setTimeout(closeSheet, 420);
    else setTimeout(() => openLead(l.id), 420);
    return;
  }
  if (a.dataset.open) { closeModal(); goLead(state.leads.find(x => x.id === a.dataset.open)); return; }

  // Named actions
  if (act === 'closeModal') closeModal();
  else if (act === 'closeLogin') document.getElementById('loginOverlay').classList.remove('open');
  else if (act === 'openLogin') openLogin();
  else if (act === 'doLogin') doLogin();
  else if (act === 'doSignup') doSignup();
  else if (act === 'openPinReset') openPinReset();
  else if (act === 'doPinReset') doPinReset();
  else if (act === 'doInviteAgent') doInviteAgent();
  else if (act === 'doAcceptInvite') doAcceptInvite();
  else if (act === 'demoMode') demoMode();
  else if (act === 'openLaunch') launch();
  else if (act === 'openAgentSetup') openAgentSetup();
  else if (act === 'saveAgent') saveAgent();
  else if (act === 'assignAgent') assignToAgent(a.dataset.id);
  else if (act === 'assignVisible') assignVisible();
  else if (act === 'loginAsAgent') { const ag = account().agents.find(x => x.id === a.dataset.id); if (ag) saveSession({ role:'agent', name:ag.name, email:ag.email, id:ag.id, territory:ag.territory }); }
  else if (act === 'logout') { localStorage.removeItem(SESSION); openLogin(); }
  else if (act === 'saveSettings') saveSettingsForm();
  else if (act === 'copyReferral') copyReferralLink();
  else if (act === 'openBranding') openBranding();
  else if (act === 'saveBranding') saveBrandingForm();
  else if (act === 'hpdView') enrichWithHPD('view');
  else if (act === 'hpdAll') enrichWithHPD('all');
  else if (act === 'acrisView') enrichWithACRIS('view');
  else if (act === 'acrisAll') enrichWithACRIS('all');
  else if (act === 'openCustomer') openCustomer();
  else if (act === 'saveCustomer') saveCustomer();
  else if (act === 'openContact') openContact();
  else if (act === 'saveContact') saveContactForm();
  else if (act === 'exportBackup') exportBackup();
  else if (act === 'exportCSV') exportCSV();
  else if (act === 'openLeaderboard') openLeaderboard();
  else if (act === 'resetData') { if (confirm('Reset all local leads?')) { state={leads:[],filter:'all'}; saveState(); renderAll(); } }
  else if (act === 'repMode' || act === 'today') repMode();
  else if (act === 'next' || act === 'nextBest') goLead(nextBestLead());
  else if (act === 'locate') locate();
  else if (act === 'satellite') toggleSatellite();
  else if (act === 'walk' || act === 'route') optimizeRoute();
  else if (act === 'clearroute') clearRoute();
  else if (act === 'livetrack') startTracking();
  else if (act === 'fit' || act === 'fitLeads') fitLeads();
  else if (act === 'add') openCreate();
  else if (act === 'loadArea') { const b = map.getBounds(); loadPlutoBounds([b.getSouth(),b.getWest(),b.getNorth(),b.getEast()], 'current map area'); }
  else if (act === 'neighborhoods') neighborhoods();
  else if (act === 'loadNbh') { const n = NEIGHBORHOODS[a.dataset.boro][+a.dataset.i]; map.fitBounds([[n[1][0],n[1][1]],[n[1][2],n[1][3]]]); closeModal(); loadPlutoBounds(n[1], n[0]); }
  else if (act === 'createLead') createLead(a);
  else if (act === 'knockNow') {
    const l = state.leads.find(x => x.id === currentLeadId); if (!l) return;
    l.status = 'knocked'; l.sun_score = sunScore(l); addLog(l, 'knocked', 'Knocked at door');
    saveState(); upsertLead(l);
    if (window.posthog) posthog.capture('lead_knocked', { addr:l.addr, boro:l.boro, sun_score:l.sun_score });
    toast('✊ Knocked'); openLead(l.id);
  }
  else if (act === 'saveDetails') { const l = state.leads.find(x => x.id === currentLeadId); if (l) saveLeadDetails(l); }
  else if (act === 'deleteLead') {
    if (confirm('Delete this lead?')) { const _did = currentLeadId; state.leads = state.leads.filter(x => x.id !== _did); saveState(); deleteLeadRemote(_did); closeSheet(); renderAll(); }
  }
  else if (act === 'handoff') { const l = state.leads.find(x => x.id === currentLeadId); const msg = `Solar/HVAC Appt Lead: ${nameOf(l)}\n${l.addr||''}\nPhone: ${l.phone||''}\nBill: ${l.monthly_bill||''}\nNotes: ${l.notes||''}`; location.href = 'sms:?body=' + encodeURIComponent(msg); }
  else if (act === 'toggleSales') { document.body.classList.toggle('sales-demo-on'); renderStats(); }
  else if (act === 'salesOff') { document.body.classList.remove('sales-demo-on'); renderStats(); }
  else if (act === 'openOnboarding') openOnboarding();
  else if (act === 'openBilling') openBilling();
  else if (act === 'stripeCheckout') stripeCheckout(a.dataset.plan);
  else if (act === 'activateTrial') activateTrial();
  else if (act === 'openBillingPortal') {
    const email = session()?.email || getBilling().billing_email;
    if (!email) { toast('Log in first to access billing portal'); return; }
    toast('Opening billing portal…');
    fetch(SB_URL + '/functions/v1/billing-portal', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ email }) })
      .then(r => r.json()).then(d => { if (d.url) window.open(d.url, '_blank'); else toast('Billing portal: ' + (d.error||'not available — subscribe first')); })
      .catch(() => toast('Could not open billing portal'));
  }
  else if (act === 'saveBillingManual') {
    const pk=val('bpPlanKey'), st=val('bpStatus'), en=val('bpEnd'), em=val('bpEmail');
    if (!STRIPE_PLANS[pk] && pk) return toast('Plan key must be: solo, team, or agency');
    saveBilling({ plan_key:pk||getBilling().plan_key, status:st||getBilling().status, period_end:st!=='trial'?en:getBilling().period_end, trial_end:st==='trial'?en:getBilling().trial_end, billing_email:em });
    renderBrand(); closeModal(); toast('✓ Billing state saved'); renderStats();
  }
  else if (act === 'openSMSBlast') openSMSBlast();
  else if (act === 'doSMSBlast') doSMSBlast();
  else if (act === 'pricing') pricing();
  else if (act === 'valueCalc') valueCalc();
  else if (act === 'calcValue') calcValue();
  else if (act === 'landingPreview') landingPreview();
  else if (act === 'runTest') runTest();
  else if (act === 'markInstall') { const c = checks(); c.install=true; saveChecks(c); toast('✓ App install marked'); renderStats(); }
  else if (act === 'copyChecklist') copyText('BlockBoss CRM Test Checklist: login, map, leads, agent assignment, dispositions, Save & Next, PLUTO load, backup, customer accounts, sales demo.', 'Checklist copied');
  else if (act === 'copyPlan') copyText(`${settings().company||'BlockBoss CRM'} account summary: Plan ${settings().plan||'Growth'}, Leads ${state.leads.length}, Agents ${(account().agents||[]).length}.`, 'Plan summary copied');
  else if (act === 'copyPitch') copyText('BlockBoss CRM helps solar/HVAC teams work from a smart map, load NYC homeowner names, prioritize high-sun homes, assign reps, track follow-ups, and manage daily production. Want to see a quick demo?', 'Pitch copied');
  else if (act === 'copyFollowup') copyText('Following up on BlockBoss CRM — it gives reps a field app and managers lead assignment, follow-up boards, performance scorecards, backups, and sales/demo tools.', 'Follow-up copied');
  else if (act === 'copyContact') { const c = contact(); copyText(`${c.name}\n${c.phone}\n${c.email}\n${c.booking}\n${c.cta}`, 'Contact copied'); }
  else if (act === 'copyLanding') copyText('BlockBoss CRM — smart map, PLUTO homeowner names, sun score, big dispositions, rep mode, customer accounts, manager dashboard, backups, and sales demo tools.', 'Landing text copied');
  else if (act === 'switchList') { closeModal(); switchView('list'); }
}
