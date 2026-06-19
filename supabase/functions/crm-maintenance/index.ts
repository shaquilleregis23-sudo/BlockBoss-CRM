import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY=Deno.env.get('CRM_SERVICE_KEY')!
const PUBLISHABLE_KEY=Deno.env.get('CRM_PUBLISHABLE_KEY')!
const MAINTENANCE_SECRET=Deno.env.get('CRM_MAINTENANCE_SECRET')!
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}})
const PLUTO='https://data.cityofnewyork.us/resource/64uk-42ks.json'

function title(v:string){return v.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}
function ownerParts(raw:string){
  const s=String(raw||'').trim(); if(!s)return {first_name:'',last_name:''}
  if(/\b(LLC|INC|CORP|TRUST|ESTATE|REALTY|PROPERTIES|HOLDINGS)\b/i.test(s))return {first_name:'',last_name:title(s)}
  const bits=s.split(/\s+/); return {first_name:title(bits.slice(1).join(' ')),last_name:title(bits[0]||'')}
}
async function authorizedTeams(req:Request){
  if(req.headers.get('x-crm-maintenance-secret')===MAINTENANCE_SECRET){const {data,error}=await admin.from('crm_teams').select('id');if(error)throw error;return (data||[]).map(x=>x.id)}
  const auth=req.headers.get('Authorization')||''; if(!auth.startsWith('Bearer '))throw Error('Unauthorized')
  const userClient=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false}})
  const {data:{user}}=await userClient.auth.getUser(); if(!user)throw Error('Unauthorized')
  const {data,error}=await admin.from('crm_team_members').select('team_id,role').eq('user_id',user.id).in('role',['master','manager']);if(error||!data?.length)throw Error('Master access required')
  return data.map(x=>x.team_id)
}
async function allRows(table:string,teamId:string){const out:any[]=[];for(let from=0;from<200000;from+=1000){const {data,error}=await admin.from(table).select('*').eq('team_id',teamId).range(from,from+999);if(error)throw error;out.push(...(data||[]));if((data||[]).length<1000)break}return out}
async function backupTeam(teamId:string){
  const [leads,members,locations]=await Promise.all([allRows('leads',teamId),allRows('crm_team_members',teamId),allRows('agent_locations',teamId)])
  const payload={format:'blockboss-team-backup-v1',created_at:new Date().toISOString(),team_id:teamId,leads,members,locations}
  const stream=new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'));const compressed=await new Response(stream).arrayBuffer();const blob=new Blob([compressed],{type:'application/gzip'});const digest=await crypto.subtle.digest('SHA-256',compressed)
  const day=new Date().toISOString().slice(0,10),path=`${teamId}/${day}.json.gz`
  const {error}=await admin.storage.from('crm-backups').upload(path,blob,{contentType:'application/gzip',upsert:true});if(error)throw error
  const {data:download,error:downloadError}=await admin.storage.from('crm-backups').download(path);if(downloadError||!download)throw downloadError||Error('Backup verification download failed');const downloaded=await download.arrayBuffer();const downloadedDigest=await crypto.subtle.digest('SHA-256',downloaded),a=new Uint8Array(digest),b=new Uint8Array(downloadedDigest);if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Backup integrity verification failed')
  const {data:files}=await admin.storage.from('crm-backups').list(teamId,{limit:100,sortBy:{column:'name',order:'desc'}})
  const old=(files||[]).slice(7).map(f=>`${teamId}/${f.name}`);if(old.length)await admin.storage.from('crm-backups').remove(old)
  return {processed:leads.length,changed:1,path,bytes:blob.size,integrity_verified:true}
}
async function refreshTeam(teamId:string){
  const {data:leads,error}=await admin.from('leads').select('local_id,team_id,bbl').eq('team_id',teamId).not('bbl','is',null).order('owner_refreshed_at',{ascending:true,nullsFirst:true}).limit(1000);if(error)throw error
  const byBBL=new Map((leads||[]).map(l=>[String(l.bbl).split('.')[0].replace(/\D/g,''),l])), owners=new Map<string,string>()
  const bbls=[...byBBL.keys()]
  for(let i=0;i<bbls.length;i+=50){const batch=bbls.slice(i,i+50),where=`bbl in (${batch.map(x=>`'${x}'`).join(',')})`;const r=await fetch(`${PLUTO}?$select=bbl,ownername&$where=${encodeURIComponent(where)}&$limit=1000`);if(!r.ok)throw Error(`PLUTO ${r.status}`);for(const row of await r.json())if(row.bbl)owners.set(String(row.bbl).replace(/\D/g,''),String(row.ownername||''))}
  const payload=bbls.map(bbl=>{const l=byBBL.get(bbl)!,owner_name=owners.get(bbl)||'',parts=ownerParts(owner_name);return {local_id:l.local_id,team_id:teamId,owner_name,...parts}})
  const {data:changed,error:applyError}=await admin.rpc('apply_scheduled_owner_refresh',{payload});if(applyError)throw applyError
  return {processed:payload.length,changed:Number(changed||0),matched:owners.size}
}
Deno.serve(async req=>{
  let runIds:number[]=[]
  try{
    const body=await req.json().catch(()=>({})),action=body.action==='owner_refresh'?'owner_refresh':'backup',teams=await authorizedTeams(req),results=[]
    for(const teamId of teams){const {data:run}=await admin.from('maintenance_runs').insert({team_id:teamId,job_type:action,status:'running'}).select('id').single();if(run?.id)runIds.push(run.id)
      try{const result=action==='backup'?await backupTeam(teamId):await refreshTeam(teamId);results.push({team_id:teamId,...result});if(run?.id)await admin.from('maintenance_runs').update({status:'success',finished_at:new Date().toISOString(),processed:result.processed,changed:result.changed,details:result}).eq('id',run.id)}
      catch(e){if(run?.id)await admin.from('maintenance_runs').update({status:'failed',finished_at:new Date().toISOString(),error:String(e?.message||e).slice(0,500)}).eq('id',run.id);throw e}}
    return Response.json({ok:true,action,results})
  }catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:String(e?.message||e).includes('Unauthorized')?401:500})}
})
