import {createClient} from 'npm:@supabase/supabase-js@2'

const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('CRM_SERVICE_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SECRET=Deno.env.get('CRM_MAINTENANCE_SECRET')!,BREVO=Deno.env.get('BREVO_API_KEY')!,CRM='https://m2-energy-crm.netlify.app'
const db=createClient(URL,KEY,{auth:{persistSession:false}})
const escape=(v:string)=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))

const templates:Record<string,(name:string)=>{subject:string;heading:string;body:string;cta:string}>={
  no_leads_d1:n=>({subject:'Load your first NYC homeowner territory',heading:`Your map is waiting, ${n}`,body:'Choose a Queens or Brooklyn neighborhood and BlockBoss will place homeowner records on your map. Your activation target is one real door result today.',cta:'Load My First Territory'}),
  no_rep_d3:n=>({subject:'Invite your first field rep securely',heading:`Build your field team, ${n}`,body:'Your plan includes secure rep access. Invite a rep, assign their territory, and they will only see leads assigned to them.',cta:'Invite My First Rep'}),
  no_knock_d5:n=>({subject:'Record your first door result in BlockBoss',heading:`Time for the first knock, ${n}`,body:'Open any homeowner pin and tap one disposition. BlockBoss records the result, updates the parcel color, and syncs it to your manager dashboard.',cta:'Record My First Knock'}),
  activated_d7:n=>({subject:'Your BlockBoss workspace is activated',heading:`You are field-ready, ${n}`,body:'Your workspace has leads and real field activity. Next, review territory completion, callbacks, manager audit, and automated backup health.',cta:'Open Command Center'}),
  trial_ending:n=>({subject:'Your BlockBoss trial ends soon',heading:`Keep your team running, ${n}`,body:'Your trial is within three days of ending. Confirm your plan so rep access, territory loading, and cloud synchronization continue without interruption.',cta:'Review Billing'})
}
function emailHtml(name:string,t:{heading:string;body:string;cta:string}){return `<!doctype html><html><body style="margin:0;background:#0d1117;color:#e6edf3;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;padding:28px"><h2 style="color:#3fb950">BlockBoss CRM</h2><div style="background:#161b22;border:1px solid #30363d;border-radius:14px;padding:24px"><h1 style="font-size:20px">${escape(t.heading)}</h1><p style="color:#aab2bd;line-height:1.65">${escape(t.body)}</p><p style="text-align:center;margin-top:24px"><a href="${CRM}" style="display:inline-block;background:#238636;color:white;padding:13px 24px;border-radius:9px;text-decoration:none;font-weight:700">${escape(t.cta)} →</a></p></div><p style="color:#6e7681;font-size:11px;text-align:center">BlockBoss CRM · Reply for support</p></div></body></html>`}
async function send(to:string,name:string,campaign:string){
  const t=templates[campaign]?.(name);if(!t)return false
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':BREVO,'content-type':'application/json'},body:JSON.stringify({sender:{name:'BlockBoss CRM',email:'shaqr@nychvacpro.com'},to:[{email:to,name}],subject:t.subject,htmlContent:emailHtml(name,t)})})
  if(!r.ok)throw Error(`Brevo ${r.status}: ${(await r.text()).slice(0,180)}`);return true
}
Deno.serve(async req=>{
  if(req.headers.get('x-crm-maintenance-secret')!==SECRET)return Response.json({error:'Unauthorized'},{status:401})
  const {data:accounts,error}=await db.from('master_accounts').select('team_id,email,name,plan_key,plan_status,plan_expires_at,activated_at').in('plan_status',['active','trial','trialing']);if(error)throw error
  let sent=0,checked=0
  for(const a of accounts||[]){if(!a.team_id||!a.email||!a.activated_at)continue;checked++;const team=String(a.team_id),days=Math.floor((Date.now()-new Date(a.activated_at).getTime())/86400000)
    const [{data:events},{data:logs}]=await Promise.all([db.from('crm_activation_events').select('milestone').eq('team_id',team),db.from('crm_lifecycle_messages').select('campaign').eq('team_id',team)])
    const done=new Set((events||[]).map(x=>x.milestone)),already=new Set((logs||[]).map(x=>x.campaign)),campaigns:string[]=[]
    if(days>=1&&!done.has('first_leads'))campaigns.push('no_leads_d1')
    if(days>=3&&!['solo','solo_annual'].includes(a.plan_key)&&!done.has('first_rep'))campaigns.push('no_rep_d3')
    if(days>=5&&!done.has('first_knock'))campaigns.push('no_knock_d5')
    if(days>=7&&done.has('first_leads')&&done.has('first_knock'))campaigns.push('activated_d7')
    if(['trial','trialing'].includes(a.plan_status)&&a.plan_expires_at){const left=(new Date(a.plan_expires_at).getTime()-Date.now())/86400000;if(left>=0&&left<=3)campaigns.push('trial_ending')}
    for(const campaign of campaigns)if(!already.has(campaign)){try{await send(a.email,a.name||'there',campaign);await db.from('crm_lifecycle_messages').insert({team_id:team,email:a.email,campaign,metadata:{days_since_activation:days}});sent++;already.add(campaign)}catch(e){console.error('Lifecycle:',campaign,a.email,e)}}
  }
  return Response.json({ok:true,checked,sent})
})
