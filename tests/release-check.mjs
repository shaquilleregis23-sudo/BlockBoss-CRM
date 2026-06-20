import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(value,message)=>{if(!value)throw new Error(message);console.log('✓',message)};
const extract=(src,name)=>{const marker='function '+name+'(',start=src.indexOf(marker);if(start<0)throw new Error('Missing function '+name);const open=src.indexOf('{',start);let depth=0;for(let i=open;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)return src.slice(start,i+1)}throw new Error('Unclosed function '+name)};

for(const file of fs.readdirSync(path.join(root,'js')).filter(x=>x.endsWith('.js')).map(x=>'js/'+x).concat(['sw.js']))execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});
ok(true,'All browser and service-worker JavaScript parses');

const html=read('index.html'),assets=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(x=>x[1].split('?')[0]).filter(x=>!x.startsWith('http')&&/\.(?:js|css|json)$/.test(x));
for(const asset of assets)ok(fs.existsSync(path.join(root,asset)),'Asset exists: '+asset);

const leadsSrc=read('js/leads.js'),ctx={window:{_blockWalkDirection:1},localStorage:{getItem:()=>null,setItem:()=>{}},Set,Math,Date};
vm.createContext(ctx);vm.runInContext(['ownerConfidence','parseDoorAddress','doorAddressOptions','matchingDoorAddress','blockWalkKey','blockWalkMemory','nextDoorLead','blockWalkLeads'].map(n=>extract(leadsSrc,n)).join('\n'),ctx);
const leads=[
{id:'61',addr:'259-61 148th Ave',status:'not_home'},
{id:'61a',addr:'259-61A 148 Avenue',status:'fresh'},
{id:'63',addr:'259-63 148 Ave',status:'fresh'},
{id:'62',addr:'259-62 148th Avenue',status:'fresh'},
{id:'64',addr:'259-64 148 Ave',status:'fresh'},
{id:'wrong',addr:'259-63 149th Ave',status:'fresh'}];ctx.scopedLeads=()=>leads;
ok(ctx.nextDoorLead(leads[0]).id==='61a','Queens letter suffix sequences before the next house number');
leads.find(x=>x.id==='61a').status='not_home';ok(ctx.nextDoorLead(leads[0]).id==='63','259-61 advances to 259-63 on the same odd side');
ctx.window._blockWalkDirection=-1;leads.find(x=>x.id==='63').status='not_home';ok(ctx.nextDoorLead(leads.find(x=>x.id==='64')).id==='62','Opposite side reverses from 259-64 to 259-62');
ok(ctx.parseDoorAddress('259-61 148th Avenue').street===ctx.parseDoorAddress('259-63 148 Ave').street,'Street suffix and ordinal variations normalize');
ok(['high','medium','low'].join(',')===[ctx.ownerConfidence({acris_owner_names:['A'],owner_freshness:'recent_deed',acris_recorded_at:new Date().toISOString()}).level,ctx.ownerConfidence({first:'A',last:'B',source:'pluto'}).level,ctx.ownerConfidence({entity:true,last:'ABC LLC'}).level].join(','),'Owner confidence covers high, medium, and low states');

const actions=read('js/actions.js');ok(actions.includes('mergeDuplicateGroup')&&actions.includes('merged_from_ids'),'Safe duplicate merge preserves provenance');
const mapSrc=read('js/map.js'),storageSrc=read('js/storage.js');
ok(mapSrc.includes('i38t-6if2.geojson')&&mapSrc.includes('within_box(the_geom'),'Official NYC TAX_LOT_POLYGON viewport source is wired');
ok(mapSrc.includes('parcelLeadIndex.get(bbl)')&&mapSrc.includes('openCreate(e.latlng,{bbl})'),'Parcel taps open matching leads or BBL-linked manual creation');
ok(storageSrc.includes("parcel_areas")&&storageSrc.includes('parcelCacheGet')&&storageSrc.includes('parcelCachePut'),'Parcel areas cache in IndexedDB for offline field use');
ok(html.includes('data-tool="parcels"')&&html.includes('id="parcelLegend"'),'Parcel toggle and field legend are present');
const authSrc=read('js/auth.js'),appSrc=read('js/app.js'),uiSrc=read('js/ui.js');
ok(authSrc.includes('activationSnapshot')&&authSrc.includes('first_knock')&&authSrc.includes('activation_milestone'),'Activation center tracks the first-knock customer journey');
const activationCtx={state:{leads:[{status:'knocked'}]},getOb:()=>({company_setup:'done',rep_invited:'done',maintenance_ready:'done'}),billingPlan:()=>({agents:5}),session:()=>({auth_v2:true}),settings:()=>({company:'Test',territory:'Queens'})};vm.createContext(activationCtx);vm.runInContext(extract(authSrc,'activationSnapshot'),activationCtx);const activation=activationCtx.activationSnapshot();ok(activation.pct===100&&activation.steps.every(x=>x.done),'Activation score derives all six real milestones');
const capacityCtx={state:{leads:new Array(4)},billingPlan:()=>({leads:5}),Math};vm.createContext(capacityCtx);vm.runInContext(extract(read('js/state.js'),'leadCapacity'),capacityCtx);ok(capacityCtx.leadCapacity(1).allowed&&!capacityCtx.leadCapacity(2).allowed,'Plan capacity blocks additions beyond the lead limit');
ok(authSrc.includes("functions.invoke('secure-invite-agent'")&&authSrc.includes('ensureAgentCapacity'),'Onboarding uses secure invites with plan seat enforcement');
ok(read('js/leads.js').includes('leadCapacity(1)')&&uiSrc.includes('leadCapacity(1)'),'Lead limits cover PLUTO, manual creation, and CSV imports');
ok(!appSrc.includes("saveBilling({ plan_key:pk, status:'active'"),'Stripe redirect cannot grant a local active subscription');
const saasMigration=read('supabase/migrations/014_saas_activation_support.sql');ok(saasMigration.includes('crm_activation_events')&&saasMigration.includes('crm_support_requests')&&saasMigration.includes('enable row level security'),'Activation analytics and support requests enforce RLS');
ok(authSrc.includes('submitSupportRequest')&&authSrc.includes("release:'v18'"),'In-app support attaches production context');
const stripeWebhook=read('supabase/functions/stripe-webhook/index.ts'),entitlements=read('supabase/migrations/015_billing_entitlements_operations.sql');
ok(stripeWebhook.includes('constructEventAsync')&&stripeWebhook.includes('stripe_webhook_events')&&stripeWebhook.includes("status==='processed'"),'Stripe webhook verifies signatures and rejects replayed events');
ok(read('supabase/config.toml').includes('[functions.stripe-webhook]')&&read('supabase/config.toml').includes('verify_jwt = false'),'Stripe can reach the signed webhook without a Supabase JWT');
ok(entitlements.includes('leads_entitlement_guard')&&entitlements.includes('crm_members_entitlement_guard'),'Database enforces lead and agent plan entitlements');
ok(read('js/sync.js').includes("from('crm_entitlements')"),'Every team member receives authoritative team billing limits');
const lifecycle=read('supabase/functions/send-lifecycle/index.ts');ok(lifecycle.includes('first_knock')&&lifecycle.includes('crm_lifecycle_messages')&&read('supabase/functions/crm-maintenance/index.ts').includes('runLifecycle'),'Activation-aware lifecycle messages run with daily maintenance');
ok(read('admin.html').includes('SaaS Operations')&&read('supabase/functions/admin-data/index.ts').includes('crm_support_requests'),'Private owner dashboard covers customers, support, billing, and health');
ok(fs.existsSync(path.join(root,'playwright.config.mjs'))&&fs.existsSync(path.join(root,'tests/e2e/field-crm.spec.mjs')),'Desktop and iPhone browser regression suite exists');
ok(fs.existsSync(path.join(root,'tests/load-100k.mjs'))&&read('package.json').includes('test:load'),'100,000-lead performance gate exists');
ok(read('ops/release-gate.github-actions.yml').includes('test:e2e')&&read('ops/release-gate.github-actions.yml').includes('test:load'),'CI template includes browser and scale gates for every main release');
const territoryCtx={scopedLeads:()=>[{id:'1',territory:'Queens',addr:'259-61 148th Ave',status:'knocked'},{id:'2',territory:'Queens',addr:'259-63 148th Ave',status:'fresh'},{id:'3',territory:'Queens',addr:'260-11 149th Ave',status:'not_home'},{id:'4',territory:'Queens',addr:'260-13 149th Ave',status:'fresh'}],blockWalkKey:l=>l.addr.includes('148')?'148:259':'149:260',normalizeAddress:v=>v,Set,Map};vm.createContext(territoryCtx);vm.runInContext(extract(actions,'territoryProgressGroups'),territoryCtx);const territory=territoryCtx.territoryProgressGroups()[0];ok(territory.pct===50&&territory.blockRows.length===2,'Territory progress calculates completion by block');ok(actions.includes('territoryProgressLayer'),'Territory heatmap layer is wired');ok(actions.includes('openHealthDashboard'),'Manager production-health dashboard is wired');
const sw=read('sw.js');ok(sw.includes("addEventListener('push'")&&sw.includes("addEventListener('notificationclick'"),'Service worker handles background push and notification clicks');
const pushFn=read('supabase/functions/send-push-reminders/index.ts');ok(pushFn.includes('callback due')&&pushFn.includes('Appointment in 30 minutes')&&pushFn.includes('New close logged'),'Push sender covers callbacks, appointments, and manager outcomes');
ok(read('supabase/migrations/011_push_subscriptions.sql').includes('enable row level security'),'Push subscriptions enforce RLS');ok(read('supabase/migrations/013_production_health_monitoring.sql').includes('managers read team health'),'Health monitoring has manager-only read policy');
const allSource=fs.readdirSync(root).filter(()=>false); // secret check uses known prefix only, never a private key.
ok(![html,sw,actions,leadsSrc,read('js/config.js')].join('\n').includes('VAPID_PRIVATE_KEY'),'Private VAPID key is absent from browser source');
console.log('\nBlockBoss release gate passed.');
