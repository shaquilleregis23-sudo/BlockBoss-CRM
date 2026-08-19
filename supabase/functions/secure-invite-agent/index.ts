import { createClient } from 'npm:@supabase/supabase-js@2'
const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('CRM_SERVICE_KEY')!,publishable=Deno.env.get('CRM_PUBLISHABLE_KEY')!
const admin=createClient(url,service,{auth:{persistSession:false}})
Deno.serve(async req=>{
  try{
    const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))throw Error('Unauthorized')
    const client=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),{data:{user}}=await client.auth.getUser();if(!user)throw Error('Unauthorized')
    const body=await req.json(),email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim(),territory=String(body.territory||'').trim();if(!/\S+@\S+\.\S+/.test(email))throw Error('Valid email required')
    const {data:boss}=await admin.from('crm_team_members').select('team_id,role').eq('user_id',user.id).in('role',['master','manager']).eq('status','active').limit(1).single();if(!boss)throw Error('Manager access required')
    const redirectTo='https://m2-energy-crm.netlify.app/?agent_invite=1'
    const {data:invite,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{name,territory,team_id:boss.team_id,role:'agent'}});if(error)throw error
    const invited=invite.user;if(!invited)throw Error('Invite user was not created')
    const {error:memberError}=await admin.from('crm_team_members').upsert({user_id:invited.id,team_id:boss.team_id,role:'agent',display_name:name||email,email,territory,status:'invited',invited_by:user.id,invited_at:new Date().toISOString()},{onConflict:'user_id,team_id'});if(memberError)throw memberError
    return Response.json({ok:true,email,team_id:boss.team_id})
  }catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:String(e?.message||e).includes('Unauthorized')?401:400})}
})
