// ── SMS Blast ─────────────────────────────────────────────────────────────────
function openSMSBlast() {
  const s = session();
  if (!s.team_id) { toast('Log in as Master to use SMS Blast'); return; }
  if (!billingActive()) { toast('Active plan required for SMS Blast'); return; }
  const statusOpts = ['all','interested','callback','not_home','set','fresh','knocked'];
  const labels = { all:'All Active Leads', interested:'Interested', callback:'Callbacks', not_home:'Not Home', set:'Appointment Set', fresh:'Fresh / New', knocked:'Knocked' };
  modal('📱 SMS Blast', `<p class="sub" style="margin-bottom:12px">Send a text to multiple leads at once. Only leads with phone numbers receive it. Max 200 per blast.</p><div class="form-row"><label>Status Filter</label><select id="smsFilter" onchange="previewSMSCount()">${statusOpts.map(v=>`<option value="${v}">${labels[v]}</option>`).join('')}</select></div><div id="smsPreviewCount" class="sub" style="margin:8px 0;padding:8px;background:rgba(63,185,80,.07);border-radius:6px;display:none"></div><div class="form-row"><label>Message <span class="sub">(use {name} and {addr} for personalization)</span></label><textarea id="smsMsg" rows="5" placeholder="Hi {name}, this is ${settings().agent_name} from BlockBoss. Following up on solar savings for your home at {addr}. Call or text back when you have a moment. Reply STOP to opt out." maxlength="320" oninput="var cc=document.getElementById('smsCharCount');if(cc)cc.textContent=this.value.length+'/160 chars ('+Math.ceil(this.value.length/160)+' SMS segment'+((Math.ceil(this.value.length/160))>1?'s':'')+')';"></textarea><div id="smsCharCount" class="sub" style="text-align:right;font-size:11px;margin-top:4px">0/160 chars (1 SMS segment)</div></div><button class="save-btn green" data-action="doSMSBlast">Send SMS Blast →</button><p class="sub" style="font-size:10px;margin-top:8px;color:var(--muted)">By sending you confirm recipients have consented to SMS from your business.</p>`);
  setTimeout(() => previewSMSCount(), 80);
}

function previewSMSCount() {
  const f = document.getElementById('smsFilter')?.value || 'all';
  const pc = document.getElementById('smsPreviewCount'); if (!pc) return;
  const s = session(); if (!s.team_id) return;
  pc.style.display = 'block'; pc.textContent = 'Counting leads…';
  fetch(SB_URL + '/functions/v1/bulk-sms', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ team_id:s.team_id, status_filter:f, message:'x', preview_only:true }) })
    .then(r => r.json())
    .then(d => {
      if (d.count !== undefined) {
        pc.textContent = '📱 ' + d.count + ' lead' + (d.count===1?'':'s') + ' with phone numbers will receive this message';
        pc.style.background = d.count > 0 ? 'rgba(63,185,80,.07)' : 'rgba(240,136,62,.07)';
      } else pc.textContent = 'Preview unavailable';
    })
    .catch(() => { pc.textContent = 'Preview unavailable (Twilio may not be configured yet)'; });
}

async function doSMSBlast() {
  const f = val('smsFilter') || 'all';
  const rawMsg = val('smsMsg').trim();
  if (!rawMsg) { toast('Enter a message first'); return; }
  if (rawMsg.length > 320) { toast('Message too long (max 320 chars)'); return; }
  const s = session(); if (!s.team_id) { toast('Log in as Master to send blasts'); return; }
  const btn = document.querySelector('[data-action="doSMSBlast"]');
  if (btn) { btn.disabled=true; btn.textContent='Sending…'; }
  try {
    const r = await fetch(SB_URL + '/functions/v1/bulk-sms', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+SB_KEY}, body:JSON.stringify({ team_id:s.team_id, status_filter:f, message:rawMsg }) });
    const d = await r.json();
    if (d.error) { toast('SMS Blast error: ' + d.error); if (btn) { btn.disabled=false; btn.textContent='Send SMS Blast →'; } return; }
    closeModal(); toast('✓ ' + d.sent + ' messages sent!' + (d.failed?' ('+d.failed+' failed)':''));
  } catch(err) { toast('Network error — check connection'); if (btn) { btn.disabled=false; btn.textContent='Send SMS Blast →'; } }
}
