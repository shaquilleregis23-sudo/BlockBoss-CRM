// ── Onboarding Wizard ─────────────────────────────────────────────────────────
function openOnboarding(step) {
  step = step || 1; saveOb({ seen:true });
  const sg = settings(), b = getBilling(), s = session();
  const bar = '<div style="display:flex;gap:5px;margin-bottom:18px">' + [1,2,3,4].map(n => '<div style="flex:1;height:3px;border-radius:2px;background:' + (n<=step?'var(--green)':'rgba(255,255,255,.08)') + '"></div>').join('') + '</div>';

  if (step === 1) {
    modal('👋 Welcome to BlockBoss CRM', bar + `<p class="sub" style="margin-bottom:14px">Let's get your team set up in 60 seconds.</p><div class="form-row"><label>Company / Team Name</label><input id="obCo" value="${esc(sg.company||'')}" placeholder="Acme Solar LLC" autofocus></div><div class="form-row"><label>Primary Territory</label><input id="obTerr" value="${esc(sg.territory||'')}" placeholder="Queens / Long Island"></div><button class="save-btn green" onclick="(function(){var co=document.getElementById('obCo').value.trim(),te=document.getElementById('obTerr').value.trim();if(!co){toast('Enter your company name');return}saveSettings({company:co,territory:te||settings().territory});renderBrand();closeModal();setTimeout(function(){openOnboarding(2)},80)})()">Next →</button>`);

  } else if (step === 2) {
    const nq = NEIGHBORHOODS.queens.map((n, i) => `<button style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:12px" onclick="(function(){closeModal();var n=NEIGHBORHOODS.queens[${i}];map.fitBounds([[n[1][0],n[1][1]],[n[1][2],n[1][3]]]);loadPlutoBounds(n[1],n[0]);saveOb({territory_loaded:true});setTimeout(function(){openOnboarding(3)},500)})()">${n[0]}</button>`).join('');
    const nb = NEIGHBORHOODS.brooklyn.map((n, i) => `<button style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:12px" onclick="(function(){closeModal();var n=NEIGHBORHOODS.brooklyn[${i}];map.fitBounds([[n[1][0],n[1][1]],[n[1][2],n[1][3]]]);loadPlutoBounds(n[1],n[0]);saveOb({territory_loaded:true});setTimeout(function(){openOnboarding(3)},500)})()">${n[0]}</button>`).join('');
    modal('📍 Load Your First Territory', bar + `<p class="sub" style="margin-bottom:10px">Tap a neighborhood to load real homeowner names onto your map.</p><div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-bottom:6px">QUEENS</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${nq}</div><div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-bottom:6px">BROOKLYN</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${nb}</div><button class="save-btn secondary" onclick="closeModal();openOnboarding(3)">Skip for now →</button>`);

  } else if (step === 3) {
    if (b.plan_key === 'solo') { openOnboarding(4); return; }
    modal('👥 Invite Your First Rep', bar + `<p class="sub" style="margin-bottom:14px">Send a rep their login link. They tap, set a PIN, and they're in.</p><div class="form-row"><label>Rep Name</label><input id="obRN" placeholder="John Smith"></div><div class="form-row"><label>Rep Email</label><input id="obRE" type="email" placeholder="john@yourcompany.com"></div><div class="form-row"><label>Territory</label><input id="obRT" placeholder="${esc(settings().territory||'')}"></div><button class="save-btn green" onclick="(function(){var n=document.getElementById('obRN').value.trim(),e=document.getElementById('obRE').value.trim(),t=document.getElementById('obRT').value.trim(),s=session();if(!e){toast('Enter rep email');return}if(!s.team_id){toast('Log in first');return}fetch(SB_URL+'/functions/v1/invite-agent',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY},body:JSON.stringify({team_id:s.team_id,master_email:s.email,master_name:s.name,agent_email:e,agent_name:n,territory:t})}).then(function(){closeModal();toast('✓ Invite sent!');openOnboarding(4)}).catch(function(){closeModal();openOnboarding(4)})})()">Send Invite →</button><button class="save-btn secondary" style="margin-top:8px" onclick="closeModal();openOnboarding(4)">Skip →</button>`);

  } else {
    modal('🎉 You\'re Ready to Knock!', bar + `<div style="text-align:center;padding:8px 0 16px"><div style="font-size:44px;margin-bottom:8px">🏘️</div><p style="font-weight:700;font-size:15px;margin-bottom:4px">BlockBoss CRM is live for your team</p><p class="sub" style="margin-bottom:16px">Here's how to hit the ground running:</p></div><div style="display:grid;gap:8px;margin-bottom:16px"><div style="background:rgba(63,185,80,.07);border:1px solid rgba(63,185,80,.2);border-radius:8px;padding:11px;font-size:13px"><b style="color:var(--green)">✊ Rep Mode</b> — Start a door session with GPS and big one-tap dispositions</div><div style="background:rgba(88,166,255,.07);border:1px solid rgba(88,166,255,.2);border-radius:8px;padding:11px;font-size:13px"><b style="color:var(--blue)">🎯 Next Best Lead</b> — Jump to your highest-priority home instantly</div><div style="background:rgba(161,113,247,.07);border:1px solid rgba(161,113,247,.2);border-radius:8px;padding:11px;font-size:13px"><b style="color:var(--purple)">📋 Closer Board</b> — All set appointments live in Stats for your closer</div></div><button class="save-btn green" data-action="closeModal">Start Knocking →</button>`);
  }
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
  const name = val('invName').trim(), email = val('invEmail').trim().toLowerCase(), territory = val('invTerritory').trim();
  if (!email) { toast('Enter the agent email'); return; }
  const btn = document.querySelector('[data-action="doInviteAgent"]');
  if (btn) { btn.disabled=true; btn.textContent='Sending…'; }
  try {
    const res = await fetch(SB_URL + '/functions/v1/invite-agent', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ team_id:s.team_id, master_email:s.email, master_name:s.name, agent_email:email, agent_name:name, territory }) });
    const data = await res.json();
    if (!res.ok || data.error) { toast('Error: ' + (data.error||'Try again')); if (btn) { btn.disabled=false; btn.textContent='Send Invite Email →'; } return; }
    closeModal(); toast('✓ Invite sent to ' + email);
  } catch(err) { toast('Network error'); if (btn) { btn.disabled=false; btn.textContent='Send Invite Email →'; } }
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
  modal('👥 Add Agent', `<div class="login-choice" style="margin-bottom:12px"><button class="active" data-agent-tab="manual">Create Manually</button><button data-agent-tab="invite">📧 Invite by Email</button></div><div id="agManual"><div class="form-grid-2"><div class="form-row"><label>Agent Name</label><input id="agName"></div><div class="form-row"><label>Territory</label><input id="agTerritory" value="${esc(settings().territory||'')}"></div></div><div class="form-grid-2"><div class="form-row"><label>Email / Username</label><input id="agEmail"></div><div class="form-row"><label>PIN</label><input id="agPin" placeholder="1234"></div></div><button class="save-btn green" data-action="saveAgent">Save Agent</button></div><div id="agInvite" style="display:none"><p class="sub" style="margin-bottom:10px">Agent gets an email with a link to set their own PIN — no PIN sharing needed.</p><div class="form-row"><label>Agent Name</label><input id="invName" placeholder="John Smith"></div><div class="form-row"><label>Agent Email</label><input id="invEmail" type="email" placeholder="rep@company.com"></div><div class="form-row"><label>Territory (optional)</label><input id="invTerritory" value="${esc(settings().territory||'')}"></div><button class="save-btn blue" data-action="doInviteAgent">Send Invite Email →</button></div>`);
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
function assignVisible() {
  const agents = account().agents || [];
  if (!agents.length) { openAgentSetup(); return; }
  modal('Assign Visible Leads', `<p class="sub">Choose an agent. Current filter controls which leads get assigned.</p>${agents.map(a=>`<div class="agent-row"><div class="nm">${esc(a.name)}</div><div class="meta">${esc(a.email)} · ${esc(a.territory||'')}</div><button class="save-btn blue" data-action="assignAgent" data-id="${a.id}">Assign Visible Leads</button></div>`).join('')}`);
}
