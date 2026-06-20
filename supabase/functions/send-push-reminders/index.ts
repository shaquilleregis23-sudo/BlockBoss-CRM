import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('CRM_SERVICE_KEY')!,secret=Deno.env.get('CRM_PUSH_SECRET')!
const vapidPublic=Deno.env.get('VAPID_PUBLIC_KEY')!,vapidPrivate=Deno.env.get('VAPID_PRIVATE_KEY')!
const admin=createClient(url,service,{auth:{persistSession:false}})
webpush.setVapidDetails('mailto:shaquilleregis23@gmail.com',vapidPublic,vapidPrivate)

type Job={key:string,team_id:string,lead_id:string,assigned_user_id?:string,assigned_user_email?:string,managers?:boolean,title:string,body:string}
Deno.serve(async req=>{
  try{
    if(req.headers.get('x-crm-push-secret')!==secret)throw Error('Unauthorized')
    const now=Date.now(),callbackFrom=new Date(now-15*60000).toISOString(),callbackTo=new Date(now+90*1000).toISOString(),apptFrom=new Date(now+29*60000).toISOString(),apptTo=new Date(now+31*60000).toISOString(),eventFrom=new Date(now-2*60000).toISOString()
    const leadFields='local_id,team_id,first,last,addr,callback_due,appt_time,assigned_user_id,assigned_user_email,status'
    const [cbRes,apptRes,auditRes]=await Promise.all([
      admin.from('leads').select(leadFields).eq('status','callback').gte('callback_due',callbackFrom).lte('callback_due',callbackTo).limit(500),
      admin.from('leads').select(leadFields).in('status',['set','sat']).gte('appt_time',apptFrom).lte('appt_time',apptTo).limit(500),
      admin.from('lead_audit_events').select('id,team_id,lead_id,before_data,after_data,created_at').gte('created_at',eventFrom).order('created_at',{ascending:false}).limit(500)
    ])
    if(cbRes.error)throw cbRes.error;if(apptRes.error)throw apptRes.error;if(auditRes.error)throw auditRes.error
    const person=(l:any)=>[l.first,l.last].filter(Boolean).join(' ')||'Homeowner'
    const jobs:Job[]=[]
    for(const l of cbRes.data||[])jobs.push({key:`callback:${l.local_id}:${l.callback_due}`,team_id:String(l.team_id),lead_id:l.local_id,assigned_user_id:l.assigned_user_id,assigned_user_email:l.assigned_user_email,title:'📞 BlockBoss callback due',body:`${person(l)} · ${l.addr||''}`})
    for(const l of apptRes.data||[])jobs.push({key:`appointment:${l.local_id}:${l.appt_time}`,team_id:String(l.team_id),lead_id:l.local_id,assigned_user_id:l.assigned_user_id,assigned_user_email:l.assigned_user_email,title:'🎯 Appointment in 30 minutes',body:`${person(l)} · ${l.addr||''}`})
    for(const e of auditRes.data||[]){const before=e.before_data||{},after=e.after_data||{},status=after.status;if(!['set','closed'].includes(status)||before.status===status)continue;jobs.push({key:`manager:${e.id}:${status}`,team_id:String(e.team_id),lead_id:e.lead_id,managers:true,title:status==='closed'?'💰 New close logged':'🎯 New appointment set',body:`${person(after)} · ${after.addr||''}`})}
    if(!jobs.length)return Response.json({ok:true,due:0,sent:0})
    const teams=[...new Set(jobs.map(j=>j.team_id))],{data:subs,error:subError}=await admin.from('push_subscriptions').select('*').in('team_id',teams);if(subError)throw subError
    const {data:members,error:memberError}=await admin.from('crm_team_members').select('user_id,team_id,role,email').in('team_id',teams);if(memberError)throw memberError
    let sent=0,failed=0
    for(const job of jobs){
      let targetIds:string[]=[]
      if(job.managers)targetIds=(members||[]).filter(x=>String(x.team_id)===job.team_id&&['master','manager'].includes(x.role)).map(x=>String(x.user_id))
      else if(job.assigned_user_id)targetIds=[String(job.assigned_user_id)]
      else if(job.assigned_user_email){const m=(members||[]).find(x=>String(x.team_id)===job.team_id&&String(x.email||'').toLowerCase()===String(job.assigned_user_email).toLowerCase());if(m)targetIds=[String(m.user_id)]}
      if(!targetIds.length)targetIds=(members||[]).filter(x=>String(x.team_id)===job.team_id&&['master','manager'].includes(x.role)).map(x=>String(x.user_id))
      for(const sub of (subs||[]).filter(s=>String(s.team_id)===job.team_id&&targetIds.includes(String(s.user_id)))){
        const key=`${job.key}:${sub.user_id}`,{data:seen}=await admin.from('push_reminder_log').select('reminder_key').eq('reminder_key',key).maybeSingle();if(seen)continue
        try{
          await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:job.title,body:job.body,lead_id:job.lead_id,url:`https://m2-energy-crm.netlify.app/?open_lead=${encodeURIComponent(job.lead_id)}`}))
          await admin.from('push_reminder_log').insert({reminder_key:key,team_id:job.team_id,lead_id:job.lead_id,user_id:sub.user_id});sent++
        }catch(e){failed++;const code=Number(e?.statusCode||0);if(code===404||code===410)await admin.from('push_subscriptions').delete().eq('id',sub.id)}
      }
    }
    return Response.json({ok:true,due:jobs.length,sent,failed})
  }catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:String(e?.message||e).includes('Unauthorized')?401:500})}
})
