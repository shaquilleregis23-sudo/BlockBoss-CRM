// ── Onboarding Wizard ─────────────────────────────────────────────────────────
function activationSnapshot(){
  const ob=getOb(),p=billingPlan(),worked=state.leads.some(l=>l.status&&l.status!=='fresh');
  const steps=[
    {key:'secure_account',label:'Secure account connected',done:!!session().auth_v2,action:'openLogin'},
    {key:'company_setup',label:'Company and territory configured',done:!!ob.company_setup,action:'openOnboarding'},
    {key:'first_leads',label:'First homeowner leads loaded',done:state.leads.length>0,action:'neighborhoods'},
    {key:'first_rep',label:p?.agents===1?'Solo workspace ready':'First rep invited securely',done:p?.agents===1||!!ob.rep_invited||(+ob.secure_agent_count>0),action:'openAgentSetup'},
    {key:'first_knock',label:'First door result recorded',done:worked||!!ob.first_knock,action:'repMode'},
    {key:'maintenance_ready',label:'Backups and owner refresh monitored',done:!!ob.maintenance_ready,action:'healthDashboard'}
  ];
  return {steps,done:steps.filter(x=>x.done).length,pct:Math.round(steps.filter(x=>x.done).length/steps.length*100)};
}
async function recordActivationMilestone(key,metadata={}){
  const ob=getOb();if(ob[key])return;saveOb({[key]:new Date().toISOString()});
  if(window.posthog)posthog.capture('activation_milestone',{milestone:key,...metadata});
  const s=session();if(sb&&navigator.onLine&&s.auth_v2&&s.team_id&&s.user_id)try{await sb.from('crm_activation_events').upsert({team_id:s.team_id,user_id:s.user_id,milestone:key,metadata},{onConflict:'team_id,user_id,milestone'});}catch(e){console.warn('Activation event:',e);}
}
function syncDerivedActivation(){
  const snap=activationSnapshot();for(const x of snap.steps)if(x.done)recordActivationMilestone(x.key,{lead_count:state.leads.length});return snap;
}
function activationCardHTML(){
  if(!isMaster())return '';
  const a=syncDerivedActivation();if(a.pct===100)return `<div class="card activation-card complete"><div class="activation-head"><div><h3>✅ Workspace Activated</h3><p class="sub">Your team is field-ready. Setup remains available anytime.</p></div><b>100%</b></div><button class="save-btn secondary" data-action="activationCenter">Review Setup</button></div>`;
  return `<div class="card activation-card"><div class="activation-head"><div><h3>🚀 Finish Workspace Setup</h3><p class="sub">Get from signup to the first recorded knock.</p></div><b>${a.pct}%</b></div><div class="track"><div class="fill" style="width:${a.pct}%"></div></div>${a.steps.map(x=>`<button class="activation-step ${x.done?'done':''}" data-action="${x.done?'activationCenter':x.action}"><span>${x.done?'✓':'○'}</span><b>${esc(x.label)}</b></button>`).join('')}<button class="save-btn green" data-action="activationCenter">Open Activation Center</button></div>`;
}
async function refreshActivationState(){
  const s=session();if(sb&&s.auth_v2&&s.team_id){
    const [{count},{data:maintenance}]=await Promise.all([
      sb.from('crm_team_members').select('*',{count:'exact',head:true}).eq('team_id',s.team_id).eq('role','agent'),
      sb.from('maintenance_runs').select('job_type,status,started_at').eq('team_id',s.team_id).order('started_at',{ascending:false}).limit(8)
    ]);
    const healthy=['backup','owner_refresh'].every(t=>maintenance?.some(r=>r.job_type===t&&r.status==='success'));
    saveOb({secure_agent_count:count||0,maintenance_ready:healthy||getOb().maintenance_ready});
  }
  renderStats();return activationSnapshot();
}
async function openActivationCenter(){
  if(!isMaster())return toast('Manager access required');
  const a=await refreshActivationState();
  modal('🚀 SaaS Activation Center',`<div class="activation-score"><b>${a.pct}%</b><span>${a.done} of ${a.steps.length} activation milestones complete</span></div>${a.steps.map(x=>`<button class="activation-row ${x.done?'done':''}" data-action="${x.done?'closeModal':x.action}"><span>${x.done?'✓':'→'}</span><div><b>${esc(x.label)}</b><small>${x.done?'Completed':'Tap to complete this step'}</small></div></button>`).join('')}<p class="sub" style="margin-top:12px">Activation target: first recorded knock within 10 minutes of signup.</p>`);
}
async function ensureAgentCapacity(){
  const p=billingPlan();if(!billingActive()){upgradeModal('Inviting field reps requires an active plan','team');return false;}if(!p||p.agents>=999)return true;if(p.agents===1){upgradeModal('Solo is a one-user workspace. Upgrade to invite a field rep.','team');return false;}
  const s=session();let count=+getOb().secure_agent_count||0;if(sb&&s.team_id){const r=await sb.from('crm_team_members').select('*',{count:'exact',head:true}).eq('team_id',s.team_id).eq('role','agent');count=r.count||0;saveOb({secure_agent_count:count});}
  if(count>=p.agents){upgradeModal(`${p.label} includes ${p.agents} agent${p.agents===1?'':'s'}. Upgrade to invite another rep.`,p.agents<5?'team':'agency');return false;}return true;
}
async function doOnboardingInvite(){
  if(!await ensureAgentCapacity())return;const name=val('obRN').trim(),email=val('obRE').trim().toLowerCase(),territory=val('obRT').trim();if(!email)return toast('Enter rep email');
  const {data,error}=await sb.functions.invoke('secure-invite-agent',{body:{email,name,territory}});if(error||!data?.ok)return toast('Invite failed: '+(data?.error||error?.message||'Try again'));
  saveOb({rep_invited:new Date().toISOString(),secure_agent_count:(+getOb().secure_agent_count||0)+1});recordActivationMilestone('first_rep',{via:'onboarding'});closeModal();toast('✓ Secure invite sent');openOnboarding(4);
}
function openOnboarding(step) {
  step=step||1;saveOb({seen:true,activation_started_at:getOb().activation_started_at||new Date().toISOString()});const sg=settings(),b=getBilling();
  const bar='<div class="onboard-progress">'+[1,2,3,4,5].map(n=>'<i class="'+(n<=step?'active':'')+'"></i>').join('')+'</div>';
  if(step===1){
    modal('👋 Welcome to BlockBoss CRM',bar+`<p class="sub">Set up a field-ready workspace in a few minutes.</p><div class="form-row"><label>Company / Team Name</label><input id="obCo" value="${esc(sg.company||'')}" placeholder="Acme Solar LLC"></div><div class="form-row"><label>Primary Territory</label><input id="obTerr" value="${esc(sg.territory||'')}" placeholder="Queens / Brooklyn"></div><button class="save-btn green" data-action="saveOnboardingCompany">Next →</button>`);
  }else if(step===2){
    const buttons=(boro)=>NEIGHBORHOODS[boro].map((n,i)=>`<button class="territory-choice" data-action="onboardingTerritory" data-boro="${boro}" data-i="${i}">${esc(n[0])}</button>`).join('');
    modal('📍 Load Your First Territory',bar+`<p class="sub">Load real NYC homeowner records now, or import purchased leads later.</p><b class="section-label">QUEENS</b><div class="territory-grid">${buttons('queens')}</div><b class="section-label">BROOKLYN</b><div class="territory-grid">${buttons('brooklyn')}</div><button class="save-btn secondary" data-action="onboardingSkipTerritory">Skip for now →</button>`);
  }else if(step===3){
    if(b.plan_key==='solo'){openOnboarding(4);return;}
    modal('👥 Invite Your First Rep',bar+`<p class="sub">They receive a protected Supabase invite and create their own password.</p><div class="form-row"><label>Rep Name</label><input id="obRN"></div><div class="form-row"><label>Rep Email</label><input id="obRE" type="email"></div><div class="form-row"><label>Territory</label><input id="obRT" value="${esc(settings().territory||'')}"></div><button class="save-btn green" data-action="onboardingInvite">Send Secure Invite →</button><button class="save-btn secondary" data-action="onboardingSkipInvite">Skip →</button>`);
  }else if(step===4){
    modal('✊ Record Your First Knock',bar+`<div class="onboard-demo"><span>1</span><b>Open any homeowner pin</b><span>2</span><b>Tap a large disposition</b><span>3</span><b>The result syncs automatically</b></div><p class="sub">Your activation checklist stays visible until the first real door result is saved.</p><button class="save-btn green" data-action="onboardingStartKnocking">Open Map & Start Knocking</button><button class="save-btn secondary" data-action="onboardingFinish">Finish Setup Without a Knock</button>`);
  }else{
    saveOb({wizard_completed_at:new Date().toISOString()});modal('🎉 Workspace Ready',bar+`<div class="ready-icon">🏘️</div><h3 style="text-align:center">Your CRM is ready for field use</h3><p class="sub" style="text-align:center">The Activation Center will keep track of anything you skipped.</p><button class="save-btn green" data-action="activationCenter">Review Activation Checklist</button><button class="save-btn secondary" data-action="closeModal">Go to Map</button>`);
  }
}
function saveOnboardingCompany(){const company=val('obCo').trim(),territory=val('obTerr').trim();if(!company)return toast('Enter your company name');saveSettings({company,territory:territory||settings().territory});recordActivationMilestone('company_setup');closeModal();openOnboarding(2);}
async function onboardingTerritory(btn){const n=NEIGHBORHOODS[btn.dataset.boro][+btn.dataset.i],before=state.leads.length;map.fitBounds([[n[1][0],n[1][1]],[n[1][2],n[1][3]]]);saveOb({territory_loaded:true});closeModal();await loadPlutoBounds(n[1],n[0]);if(state.leads.length>before)recordActivationMilestone('first_leads',{source:'pluto',count:state.leads.length-before});openOnboarding(3);}
function openSupportCenter(){
  const s=session();modal('🛟 BlockBoss Support',`<p class="sub">Send a question or production issue with device and sync context attached automatically.</p><div class="form-grid-2"><div class="form-row"><label>Category</label><select id="supportCategory"><option value="question">Question</option><option value="data">Homeowner data</option><option value="sync">Sync / login</option><option value="billing">Billing</option><option value="bug">Bug</option></select></div><div class="form-row"><label>Priority</label><select id="supportPriority"><option value="normal">Normal</option><option value="urgent">Urgent — field blocked</option></select></div></div><div class="form-row"><label>Subject</label><input id="supportSubject" placeholder="Short summary"></div><div class="form-row"><label>What happened?</label><textarea id="supportDescription" rows="5" placeholder="What were you doing, and what did you expect?"></textarea></div><button class="save-btn green" data-action="submitSupport">Send Support Request</button><p class="sub">Signed in as ${esc(s.email||agentName())}</p>`);}
async function submitSupportRequest(){
  const s=session(),subject=val('supportSubject').trim(),description=val('supportDescription').trim(),category=val('supportCategory'),priority=val('supportPriority');if(!subject||description.length<10)return toast('Add a subject and a little more detail');if(!sb||!s.auth_v2||!s.team_id)return toast('Secure login required to contact support');if(!navigator.onLine)return toast('Reconnect to send this support request');
  const context={release:'v18',url:location.href,online:navigator.onLine,queued:offlineQueue?.length||0,lead_count:state.leads.length,user_agent:navigator.userAgent};const {data,error}=await sb.from('crm_support_requests').insert({team_id:s.team_id,user_id:s.user_id,reporter_email:s.email||'',category,priority,subject,description,context}).select('id').single();
  if(error)return toast('Support request failed: '+error.message);closeModal();toast(`✓ Support request ${String(data.id).slice(0,8)} sent`);if(window.posthog)posthog.capture('support_request_created',{category});
}

// ── Billing Modals ────────────────────────────────────────────────────────────
function upgradeModal(feat, planKey) {
  const fromPlan = billingPlan()?.label || 'your plan';
  const upgradeTo = planKey ? STRIPE_PLANS[planKey] : STRIPE_PLANS.team;
  const pk = planKey || 'team';
  modal('⚡ Upgrade Required', `<p class="sub" style="margin-bottom:14px"><strong>${feat}</strong> requires upgrading from ${fromPlan}.</p><div style="background:rgba(88,166,255,.07);border:1px solid rgba(88,166,255,.25);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px"><div style="font-size:20px;font-weight:800;color:var(--blue)">${upgradeTo.label}</div><div style="font-size:26px;font-weight:900;margin:6px 0">$${upgradeTo.price}<span style="font-size:13px;font-weight:400;color:var(--muted)">/mo</span></div><div style="font-size:12px;color:var(--muted)">${upgradeTo.desc}</div></div><button class="save-btn blue" onclick="closeModal();stripeCheckout('${pk}')">Upgrade to ${upgradeTo.label} →</button><button class="save-btn secondary" data-action="closeModal">Maybe Later</button>`);
}
function openBilling() {
  const b = getBilling(), active = billingActive(), plan = billingPlan();
  const _annual = window._annualBilling || false;
  const statusBar = active
    ? `<div class="billing-status-bar"><span class="billing-pill">${esc(plan?.label||'Active')}</span><span style="font-size:12px;font-weight:700;flex:1">Plan active${b.period_end?' · Renews '+esc(b.period_end):''}</span><button class="pill-btn" data-action="openBillingPortal">Manage</button></div>`
    : '<p class="sub" style="margin-bottom:12px">Upgrade to unlock team features, higher lead limits, and rep tracking. Cancel anytime.</p>';
  const activePlans = _annual ? STRIPE_ANNUAL : STRIPE_PLANS;
  const cards = Object.entries(activePlans).map(([key, p]) => {
    const isCurrent = (b.plan_key===key || b.plan_key===key+'_annual') && active;
    return `<div class="plan-card${key==='team'?' featured':''}${isCurrent?' current-plan':''}"><div class="plan-name">${p.label}${key==='team'?'<span class="plan-badge">Most Popular</span>':''}</div><div class="plan-price">$${p.price}<span>/mo</span></div><div class="plan-features">${p.desc}</div><button class="plan-btn ${isCurrent?'cta-green':key==='team'?'cta-blue':''}" data-action="stripeCheckout" data-plan="${key}">${isCurrent?'✓ Current Plan':active?'Switch':'Get Started'}</button></div>`;
  }).join('');
  modal('💳 BlockBoss CRM Billing', `${statusBar}<div style="display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:14px;background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:3px;width:fit-content;margin-left:auto;margin-right:auto"><button onclick="window._annualBilling=false;openBilling()" style="background:${_annual?'transparent':'var(--blue)'};color:${_annual?'var(--muted)':'#fff'};border:none;border-radius:999px;padding:6px 18px;font-size:12px;font-weight:700;cursor:pointer">Monthly</button><button onclick="window._annualBilling=true;openBilling()" style="background:${_annual?'var(--green)':'transparent'};color:${_annual?'#fff':'var(--muted)'};border:none;border-radius:999px;padding:6px 18px;font-size:12px;font-weight:700;cursor:pointer">Annual ✦ Save 20%</button></div><div class="billing-plans">${cards}</div><p class="sub" style="text-align:center;margin-bottom:10px">All plans include the core field CRM. Cancel anytime from your Stripe billing portal.</p><div class="action-grid"><button class="green" data-action="activateTrial">Start 14-Day Trial</button><button class="blue" data-action="openBillingPortal">Billing Portal</button></div>`);
}
function stripeCheckout(planKey) {
  const plan = STRIPE_PLANS[planKey] || STRIPE_ANNUAL[planKey];
  if (!plan) return;
  const email = session()?.email || getBilling().billing_email || '';
  const params = new URLSearchParams();
  if (email) params.set('prefilled_email', email);
  params.set('client_reference_id', planKey);
  window.open(plan.link + '?' + params.toString(), '_blank');
}
function activateTrial() {
  const b = getBilling();
  if (b.plan_key && b.status === 'active') { toast('Plan already active — use Billing Portal to manage'); return; }
  const email = session()?.email || b.billing_email;
  if (!email) { toast('Log in first to start a trial'); return; }
  toast('Opening Stripe trial checkout…');
  fetch(SB_URL + '/functions/v1/create-checkout', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ email, plan_key:'team', name:session()?.name||email, trial:true }) })
    .then(r => r.json()).then(d => { if (d.url) window.open(d.url, '_blank'); else toast('Trial error: ' + (d.error||'Try again')); })
    .catch(() => toast('Network error'));
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function membershipForUser(user) {
  if (!sb || !user?.id) return null;
  const { data, error } = await sb.from('crm_team_members').select('team_id,role,display_name').eq('user_id', user.id).limit(1);
  if (error || !data?.length) return null;
  return data[0];
}
async function establishSecureSession(authSession) {
  const user=authSession?.user; if(!user)return false;
  const membership=await membershipForUser(user); if(!membership)return false;
  saveSession({ auth_v2:true, user_id:user.id, role:membership.role||'agent', name:membership.display_name||user.user_metadata?.name||user.email, email:user.email, team_id:membership.team_id });
  recordActivationMilestone('secure_account');
  if(membership.role!=='agent'&&!getOb().seen)setTimeout(()=>openOnboarding(1),1000);
  if (sb.realtime && authSession.access_token) sb.realtime.setAuth(authSession.access_token);
  return true;
}
async function initSecureAuth() {
  if(!sb?.auth)return false;
  const { data }=await sb.auth.getSession();
  if(data?.session && await establishSecureSession(data.session))return true;
  sb.auth.onAuthStateChange((_event,authSession)=>{ if(authSession) setTimeout(()=>establishSecureSession(authSession).then(ok=>{if(ok){syncFromSupabase();initRealtime();}}),0); });
  return false;
}
async function logoutCRM() {
  try{if(sb?.auth)await sb.auth.signOut();}catch(e){}
  localStorage.removeItem(SESSION);
  if(leadRealtimeChannel){sb?.removeChannel(leadRealtimeChannel);leadRealtimeChannel=null;}
  if(locationRealtimeChannel){sb?.removeChannel(locationRealtimeChannel);locationRealtimeChannel=null;}
  openLogin(); toast('Securely logged out');
}
async function securePasswordLogin(email,password) {
  if(!sb?.auth || !email || password.length<6)return false;
  const { data,error }=await sb.auth.signInWithPassword({email,password});
  if(error || !data?.session)return false;
  if(!await establishSecureSession(data.session)){window._unlinkedAuthSession=data.session;return 'unlinked';}
  return true;
}
function openLogin() {
  const a = account(), m = document.getElementById('loginOverlay');
  m.innerHTML = `<div class="login-box"><h2>Welcome to BlockBoss CRM</h2><p>Owner/master controls teams, leads, assignments and setup. Agents see assigned leads only.</p><div class="login-choice" style="grid-template-columns:1fr 1fr 1fr"><button class="active" data-login-role="master">👑 Master</button><button data-login-role="agent">👥 Agent</button><button data-login-role="signup" style="background:rgba(63,185,80,.12);border-color:rgba(63,185,80,.35);color:var(--green)">✨ Sign Up</button></div><div id="loginSection"><div class="form-row"><label>Email / username</label><input id="loginEmail" autocomplete="username" value="${esc(a.master_email||'')}"></div><div class="form-row"><label>Password / legacy PIN</label><input id="loginPin" type="password" autocomplete="current-password"></div><button class="save-btn blue" data-action="doLogin">Login</button><button class="save-btn secondary" data-action="demoMode">Try Demo Mode</button><p class="sub" style="text-align:center;margin-top:8px"><span data-action="openPinReset" style="color:var(--blue);cursor:pointer;font-size:12px">Forgot PIN?</span> · <span data-action="openSecureUpgrade" style="color:var(--green);cursor:pointer;font-size:12px;font-weight:700">Upgrade Legacy Login</span></p></div><div id="signupSection" style="display:none"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">${Object.entries(STRIPE_PLANS).map(([k, p]) => `<div data-su-plan="${k}" onclick="window._suPlan=this.dataset.suPlan;document.querySelectorAll('[data-su-plan]').forEach(c=>{c.style.cssText=c.style.cssText.replace(/border:[^;]+/,'border:1px solid var(--border)');c.style.background=''});this.style.border='2px solid var(--blue)';this.style.background='rgba(88,166,255,.08)'" style="${k==='team'?'border:2px solid rgba(88,166,255,.5);background:rgba(88,166,255,.08)':'border:1px solid var(--border)'};border-radius:12px;padding:8px;cursor:pointer;text-align:center;transition:all .15s"><div style="font-weight:700;font-size:12px">${p.label}</div><div style="font-size:18px;font-weight:800;color:var(--blue)">$${p.price}</div><div style="font-size:9px;color:var(--muted)">/mo</div><div style="font-size:9px;color:var(--muted);margin-top:3px;line-height:1.2">${p.desc.split('·')[0].trim()}</div></div>`).join('')}</div><div class="form-row"><label>Your Name</label><input id="suName" placeholder="John Smith"></div><div class="form-row"><label>Company Name</label><input id="suCompany" placeholder="Acme Solar LLC"></div><div class="form-row"><label>Work Email</label><input id="suEmail" type="email" placeholder="you@company.com" autocomplete="email"></div><div class="form-row"><label>Choose a password (6+ characters)</label><input id="suPin" type="password" minlength="6" maxlength="72" placeholder="6+ characters"></div><button class="save-btn green" data-action="doSignup">Continue to Payment →</button></div><button class="save-btn secondary" data-action="closeLogin">Close</button><p class="sub" style="margin-top:10px">Already have an account? Switch to Master or Agent tab above.</p></div>`;
  window._loginRole = 'master';
  if (!window._suPlan) window._suPlan = 'team';
  m.classList.add('open');
}
async function doLogin() {
  const email = val('loginEmail').toLowerCase(), pin = val('loginPin'), role = window._loginRole || 'master';
  setSyncDot('busy');
  // Supabase Auth is attempted first. Legacy PIN lookup remains during the
  // migration window so the original shared production data keeps working.
  const secureResult=await securePasswordLogin(email,pin);
  if (secureResult === true) {
    document.getElementById('loginOverlay').classList.remove('open'); toast('✓ Secure login');
    await syncFromSupabase(); syncBillingFromSupabase(); initRealtime(); subscribeLocations(); flushQueue();
    return;
  }
  if (secureResult === 'unlinked') { openSecureClaim(email,role); return; }
  const sbData = await sbLookup(email, pin, role);
  if (sbData) {
    saveSession({ role, name:sbData.name, email:sbData.email||email, team_id:sbData.team_id, pin });
    document.getElementById('loginOverlay').classList.remove('open');
    toast('✓ Logged in');
    await syncFromSupabase(); syncBillingFromSupabase(); initRealtime(); subscribeLocations();
    startTracking(); requestNotifPerm().then(scheduleCallbackNotifs); flushQueue();
    if (!getOb().seen) setTimeout(openOnboarding, 1200);
    if (window.posthog) posthog.identify(email, { name:sbData.name, role, plan:getBilling().plan_key||'none' });
    return;
  }
  const a = account();
  if (role === 'master') {
    if (a.master_pin && pin === a.master_pin && (!a.master_email || !email || email === String(a.master_email).toLowerCase())) {
      saveSession({ role:'master', name:a.master_name||'Shaquille', email:a.master_email||email });
      document.getElementById('loginOverlay').classList.remove('open');
      toast('✓ Logged in (local)'); setSyncDot('err'); return;
    }
    if (confirm('Master not found. Recover this browser as Master with the email/PIN entered? Only do this if you are the owner.')) {
      a.master_name = a.master_name || 'Shaquille'; a.master_email = email; a.master_pin = pin || '1234';
      saveAccount(a); saveSession({ role:'master', name:a.master_name, email });
      document.getElementById('loginOverlay').classList.remove('open');
      toast('✓ Master recovered'); return;
    }
    toast('Login not matched'); setSyncDot('err');
  } else {
    const ag = (a.agents||[]).find(x => String(x.email).toLowerCase() === email && String(x.pin) === pin);
    if (!ag) { toast('Agent login not found'); setSyncDot('err'); return; }
    saveSession({ role:'agent', name:ag.name, email:ag.email, id:ag.id, territory:ag.territory });
    document.getElementById('loginOverlay').classList.remove('open'); toast('✓ Agent logged in');
  }
}
async function doSignup() {
  const name = val('suName').trim(), company = val('suCompany').trim(), email = val('suEmail').trim().toLowerCase(), pin = val('suPin').trim(), plan_key = window._suPlan || 'team';
  if (!name || !email || !pin) { toast('Please fill in name, email and PIN'); return; }
  if (!/\S+@\S+\.\S+/.test(email)) { toast('Enter a valid email address'); return; }
  if (pin.length < 6) { toast('Password must be at least 6 characters'); return; }
  const btn = document.querySelector('[data-action="doSignup"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
  try {
    const res = await fetch(SB_URL + '/functions/v1/pre-register', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ name, company, email, pin, plan_key, ref:localStorage.getItem('m2_ref')||undefined }) });
    const data = await res.json();
    if (!res.ok || data.error) { toast('Signup error: ' + (data.error||res.statusText)); if (btn) { btn.disabled=false; btn.textContent='Continue to Payment →'; } return; }
    // Create the secure Auth identity in parallel with the existing billing
    // registration. A 6+ character password is required by Supabase Auth.
    if (sb?.auth && pin.length >= 6) {
      const authResult = await sb.auth.signUp({ email, password:pin, options:{ data:{ name, company } } });
      if (!authResult.error && authResult.data?.session) {
        const boot = await sb.rpc('bootstrap_crm_team', { company_name:company, member_name:name });
        if (!boot.error) await establishSecureSession(authResult.data.session);
      }
    }
    saveBilling({ billing_email:email, plan_key, status:'pending' });
    document.getElementById('loginOverlay').classList.remove('open');
    toast(data.existing ? 'Account found — opening payment…' : 'Account created — opening Stripe…');
    setTimeout(() => window.open(data.payment_url, '_blank'), 300);
  } catch(err) {
    console.error('doSignup:', err); toast('Network error — check connection and try again');
    if (btn) { btn.disabled=false; btn.textContent='Continue to Payment →'; }
  }
}
function openSecureUpgrade() {
  const ls=document.getElementById('loginSection'); if(!ls)return;
  const email=val('loginEmail')||account().master_email||'';
  ls.innerHTML=`<div style="background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.25);border-radius:10px;padding:10px;margin-bottom:12px"><b style="color:var(--green)">🔐 Secure your existing account</b><p class="sub" style="margin:4px 0 0">Your old PIN proves ownership. Your new password is handled by Supabase Auth and is never stored in the CRM.</p></div><div class="form-row"><label>Existing account email</label><input id="upEmail" type="email" autocomplete="email" value="${esc(email)}"></div><div class="form-row"><label>Current legacy PIN</label><input id="upLegacyPin" type="password" inputmode="numeric" autocomplete="current-password"></div><div class="form-row"><label>New secure password (8+ characters)</label><input id="upPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password"></div><div class="form-row"><label>Confirm new password</label><input id="upConfirm" type="password" minlength="8" maxlength="72" autocomplete="new-password"></div><button class="save-btn green" data-action="doSecureUpgrade">Create Secure Login</button><button class="save-btn secondary" data-action="openLogin">Back</button>`;
}
function openSecureClaim(email,role='master') {
  const ls=document.getElementById('loginSection'); if(!ls)return;
  window._secureClaimRole=role;
  ls.innerHTML=`<div style="background:rgba(88,166,255,.08);border:1px solid rgba(88,166,255,.25);border-radius:10px;padding:10px;margin-bottom:12px"><b style="color:var(--blue)">One final verification</b><p class="sub" style="margin:4px 0 0">Your Supabase login is valid. Enter the old CRM PIN once to connect your existing team and leads.</p></div><div class="form-row"><label>Authenticated email</label><input id="claimEmail" value="${esc(email||'')}" disabled></div><div class="form-row"><label>Current legacy PIN</label><input id="claimLegacyPin" type="password" inputmode="numeric" autocomplete="current-password"></div><button class="save-btn green" data-action="doSecureClaim">Connect Existing Account</button><button class="save-btn secondary" data-action="openLogin">Back</button>`;
}
async function claimLegacyMembership(email,legacyPin,role='master') {
  const { data,error }=await sb.rpc('migrate_legacy_account',{legacy_email:email,legacy_pin:legacyPin,requested_role:role});
  if(error)throw error;
  const { data:authData }=await sb.auth.getSession();
  if(!authData?.session || !await establishSecureSession(authData.session))throw Error('Membership could not be confirmed');
  window._unlinkedAuthSession=null; return data;
}
async function finishSecureUpgrade(email,legacyPin,role) {
  await claimLegacyMembership(email,legacyPin,role);
  document.getElementById('loginOverlay').classList.remove('open');
  toast('✓ Secure login connected');
  await syncFromSupabase(); syncBillingFromSupabase(); initRealtime(); subscribeLocations(); flushQueue();
}
async function doSecureUpgrade() {
  const email=val('upEmail').trim().toLowerCase(),legacyPin=val('upLegacyPin').trim(),password=val('upPassword'),confirmPassword=val('upConfirm'),role=window._loginRole||'master';
  if(!/\S+@\S+\.\S+/.test(email))return toast('Enter your account email');
  if(!legacyPin)return toast('Enter your current legacy PIN');
  if(password.length<8)return toast('Use at least 8 characters');
  if(password!==confirmPassword)return toast('Passwords do not match');
  const btn=document.querySelector('[data-action="doSecureUpgrade"]');if(btn){btn.disabled=true;btn.textContent='Creating secure login…';}
  try{
    let authResult=await sb.auth.signUp({email,password,options:{data:{legacy_upgrade:true},emailRedirectTo:location.origin+location.pathname+'?auth_upgrade=1'}});
    if(authResult.error){authResult=await sb.auth.signInWithPassword({email,password});}
    if(authResult.error)throw authResult.error;
    if(authResult.data?.session){await finishSecureUpgrade(email,legacyPin,role);return;}
    document.getElementById('loginSection').innerHTML=`<div style="text-align:center;padding:12px"><div style="font-size:36px">✉️</div><h3>Check your email</h3><p class="sub">Open the Supabase confirmation link for ${esc(email)}. Then return here, log in with your new password, and enter the old PIN once to connect your leads.</p></div><button class="save-btn blue" data-action="openLogin">Back to Login</button>`;
  }catch(e){toast(e.message?.includes('Legacy')?'Old email or PIN did not match':'Secure upgrade failed: '+(e.message||'Try again'));if(btn){btn.disabled=false;btn.textContent='Create Secure Login';}}
}
async function doSecureClaim() {
  const email=val('claimEmail').trim().toLowerCase(),legacyPin=val('claimLegacyPin').trim(),role=window._secureClaimRole||'master';
  if(!legacyPin)return toast('Enter your old CRM PIN');
  const btn=document.querySelector('[data-action="doSecureClaim"]');if(btn){btn.disabled=true;btn.textContent='Connecting…';}
  try{await finishSecureUpgrade(email,legacyPin,role);}catch(e){toast(e.message?.includes('Legacy')?'Old email or PIN did not match':'Could not connect account');if(btn){btn.disabled=false;btn.textContent='Connect Existing Account';}}
}
function openPinReset() {
  const ls = document.getElementById('loginSection'); if (!ls) return;
  ls.innerHTML = `<div class="form-row"><label>Your account email</label><input id="resetEmail" type="email" placeholder="you@company.com" autocomplete="email"></div><button class="save-btn blue" data-action="doPinReset">Send New PIN →</button><button class="save-btn secondary" data-action="openLogin" style="margin-top:6px">Back to Login</button>`;
}
async function doPinReset() {
  const email = val('resetEmail').trim().toLowerCase();
  if (!email) { toast('Enter your email address'); return; }
  const btn = document.querySelector('[data-action="doPinReset"]');
  if (btn) { btn.disabled=true; btn.textContent='Sending…'; }
  try {
    await fetch(SB_URL + '/functions/v1/reset-pin', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ email }) });
    const ls = document.getElementById('loginSection');
    if (ls) ls.innerHTML = `<div style="text-align:center;padding:16px"><div style="font-size:28px;margin-bottom:8px">✓</div><p style="color:var(--green);font-weight:600;margin:0 0 6px">Check your inbox!</p><p class="sub">A new PIN was sent to ${esc(email)}.</p></div><button class="save-btn secondary" data-action="openLogin">Back to Login</button>`;
  } catch(err) { toast('Network error — try again'); if (btn) { btn.disabled=false; btn.textContent='Send New PIN →'; } }
}

// ── Agent Management ──────────────────────────────────────────────────────────
async function doInviteAgent() {
  const s = session(); if (!s.team_id) { toast('Log in as Master to invite agents'); return; }
  if(!await ensureAgentCapacity())return;
  const name = val('invName').trim(), email = val('invEmail').trim().toLowerCase(), territory = val('invTerritory').trim();
  if (!email) { toast('Enter the agent email'); return; }
  const btn = document.querySelector('[data-action="doInviteAgent"]');
  if (btn) { btn.disabled=true; btn.textContent='Sending…'; }
  try {
    const {data,error}=await sb.functions.invoke('secure-invite-agent',{body:{email,name,territory}});
    if(error||!data?.ok) { toast('Error: ' + (data?.error||error?.message||'Try again')); if (btn) { btn.disabled=false; btn.textContent='Send Secure Invite →'; } return; }
    saveOb({rep_invited:new Date().toISOString(),secure_agent_count:(+getOb().secure_agent_count||0)+1});recordActivationMilestone('first_rep',{via:'agent_setup'});closeModal(); toast('✓ Invite sent to ' + email);
  } catch(err) { toast('Network error'); if (btn) { btn.disabled=false; btn.textContent='Send Invite Email →'; } }
}
async function showSecureAgentInvite(){
  const {data}=await sb.auth.getSession();if(!data?.session)return toast('Open the newest invite link from your email');
  modal('🔐 Create Your Agent Password',`<p class="sub">Choose a secure password to activate your assigned territory.</p><div class="form-row"><label>New password (8+ characters)</label><input id="agentNewPassword" type="password" minlength="8" autocomplete="new-password"></div><div class="form-row"><label>Confirm password</label><input id="agentConfirmPassword" type="password" minlength="8" autocomplete="new-password"></div><button class="save-btn green" data-action="activateSecureAgent">Activate Secure Agent Account</button>`);
}
async function activateSecureAgent(){
  const password=val('agentNewPassword'),confirmPassword=val('agentConfirmPassword');if(password.length<8)return toast('Use at least 8 characters');if(password!==confirmPassword)return toast('Passwords do not match');
  const {error}=await sb.auth.updateUser({password});if(error)return toast(error.message||'Could not set password');const {error:rpcError}=await sb.rpc('activate_my_crm_membership');if(rpcError)return toast('Could not activate membership');
  const {data}=await sb.auth.getSession();if(data?.session)await establishSecureSession(data.session);closeModal();toast('✓ Agent account activated');await syncFromSupabase();initRealtime();
}
function showAcceptInvite(token) {
  window._inviteToken = token;
  modal('🎉 You\'ve Been Invited!', `<p class="sub" style="line-height:1.6;margin-bottom:12px">You've been invited to join an BlockBoss CRM team. Set a PIN to activate your account.</p><div class="form-row"><label>Choose a PIN (4–6 digits)</label><input id="invAccPin" type="password" maxlength="6" placeholder="e.g. 9876" inputmode="numeric"></div><button class="save-btn green" data-action="doAcceptInvite">Activate My Account →</button>`);
}
async function doAcceptInvite() {
  const token = window._inviteToken, pin = val('invAccPin').trim();
  if (!token) { toast('Invalid invite link'); return; }
  if (pin.length < 6) { toast('Password must be at least 6 characters'); return; }
  const btn = document.querySelector('[data-action="doAcceptInvite"]');
  if (btn) { btn.disabled=true; btn.textContent='Activating…'; }
  try {
    const res = await fetch(SB_URL + '/functions/v1/accept-invite', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ token, pin }) });
    const data = await res.json();
    if (!res.ok || data.error) { toast('Error: ' + (data.error||'Invalid or expired invite')); if (btn) { btn.disabled=false; btn.textContent='Activate My Account →'; } return; }
    closeModal(); toast('✓ Account activated — log in with your email and PIN');
    setTimeout(openLogin, 900);
  } catch(err) { toast('Network error — try again'); if (btn) { btn.disabled=false; btn.textContent='Activate My Account →'; } }
}
function openAgentSetup() {
  if(!session().auth_v2)return toast('Secure master login required');
  modal('👥 Invite Secure Agent', `<p class="sub" style="margin-bottom:10px">Supabase sends the agent a protected email link. They create their own password; you never handle it.</p><div class="form-row"><label>Agent Name</label><input id="invName" placeholder="John Smith"></div><div class="form-row"><label>Agent Email</label><input id="invEmail" type="email" placeholder="rep@company.com"></div><div class="form-row"><label>Territory</label><input id="invTerritory" value="${esc(settings().territory||'')}"></div><button class="save-btn blue" data-action="doInviteAgent">Send Secure Invite →</button>`);
}
function saveAgent() {
  const a = account(), email = val('agEmail').toLowerCase();
  a.agents = a.agents || [];
  const ex = a.agents.find(x => String(x.email).toLowerCase() === email);
  const ag = { id:ex?.id||'a_'+Date.now(), name:val('agName'), email, pin:val('agPin'), territory:val('agTerritory') };
  if (ex) Object.assign(ex, ag); else a.agents.push(ag);
  saveAccount(a); closeModal(); toast('✓ Agent saved'); renderStats();
}
function assignToAgent(id) {
  const a = account(), ag = (a.agents||[]).find(x => x.id === id); if (!ag) return;
  const arr = filterLeads();
  if (!confirm(`Assign ${arr.length} visible leads to ${ag.name}?`)) return;
  arr.forEach(l => { l.assigned_agent=ag.name; l.assigned_user_email=ag.email; l.assigned_user_id=ag.id; if (ag.territory) l.territory=ag.territory; l.updated_at=new Date().toISOString(); });
  saveState(); toast(`✓ Assigned ${arr.length} leads`); renderAll();
}
async function assignVisible() {
  if(session().auth_v2&&sb){
    const {data,error}=await sb.from('crm_team_members').select('user_id,display_name,email,territory,status').eq('team_id',session().team_id).eq('role','agent');
    if(error)return toast('Could not load secure agents');if(!data?.length){openAgentSetup();return;}
    modal('Assign Visible Leads',`<p class="sub">Only leads assigned here are visible to that agent.</p>${data.map(a=>`<div class="agent-row"><div class="nm">${esc(a.display_name||a.email)} <span class="badge ${a.status==='active'?'hot':'gold'}">${esc(a.status)}</span></div><div class="meta">${esc(a.email||'')} · ${esc(a.territory||'')}</div><button class="save-btn blue" data-action="assignSecureAgent" data-user-id="${esc(a.user_id)}" data-email="${esc(a.email||'')}" data-name="${esc(a.display_name||a.email||'Agent')}" data-territory="${esc(a.territory||'')}">Assign Visible Leads</button></div>`).join('')}`);return;
  }
  const agents = account().agents || [];
  if (!agents.length) { openAgentSetup(); return; }
  modal('Assign Visible Leads', `<p class="sub">Choose an agent. Current filter controls which leads get assigned.</p>${agents.map(a=>`<div class="agent-row"><div class="nm">${esc(a.name)}</div><div class="meta">${esc(a.email)} · ${esc(a.territory||'')}</div><button class="save-btn blue" data-action="assignAgent" data-id="${a.id}">Assign Visible Leads</button></div>`).join('')}`);
}
function assignToSecureAgent(button){
  const arr=filterLeads(),name=button.dataset.name,email=button.dataset.email,userId=button.dataset.userId,territory=button.dataset.territory;
  if(!confirm(`Assign ${arr.length} visible leads to ${name}?`))return;
  arr.forEach(l=>{l.assigned_agent=name;l.assigned_user_email=email;l.assigned_user_id=userId;if(territory)l.territory=territory;l.updated_at=new Date().toISOString();});saveState();upsertBatch(arr);closeModal();toast(`✓ Assigned ${arr.length} leads to ${name}`);renderAll();
}
