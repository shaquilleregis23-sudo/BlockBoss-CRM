// ── Supabase ─────────────────────────────────────────────────────────────────
const SB_URL = 'https://cghblukwgsqqwedlzmgh.supabase.co';
const SB_KEY = 'sb_publishable_btkoyC4o37GZNUOFMKtasQ_KmLIrUVb';
const VAPID_PUBLIC_KEY = 'BG2mv3IW-TyFX4Jicx6PErQsDtDMQEsWLEGQuBKGoF8pHz0NJM2O4-UnlG4uuH7_h0nyisAdS85dD9Vssqptbfs';
let sb = null;
try { sb = window.supabase?.createClient?.(SB_URL, SB_KEY) || null; } catch(e) { console.warn('Supabase init:', e); }

// ── Stripe Plans ──────────────────────────────────────────────────────────────
const STRIPE_ANNUAL = {
  solo:   { label:'Solo Annual',   price:470,  agents:1,   leads:5000,   desc:'1 rep · 5k leads · 2 months free',             link:'https://buy.stripe.com/eVqcN5cue3Le9gudy2gjC03' },
  team:   { label:'Team Annual',   price:1430, agents:5,   leads:25000,  desc:'Up to 5 reps · 25k leads · 2 months free',     link:'https://buy.stripe.com/dRm3cv3XI2Ha9gu79EgjC04' },
  agency: { label:'Agency Annual', price:3350, agents:999, leads:999999, desc:'Unlimited reps · Priority support · 2 months free', link:'https://buy.stripe.com/3cI3cv9i20z28cq51wgjC05' }
};
const STRIPE_PLANS = {
  solo:   { label:'Solo',   price:49,  agents:1,   leads:5000,   desc:'1 rep · 5k leads · All field features · Offline queue',       link:'https://buy.stripe.com/eVqcN5cue3Le9gudy2gjC03' },
  team:   { label:'Team',   price:149, agents:5,   leads:25000,  desc:'Up to 5 reps · 25k leads · Live tracking · Leaderboard',      link:'https://buy.stripe.com/dRm3cv3XI2Ha9gu79EgjC04' },
  agency: { label:'Agency', price:349, agents:999, leads:999999, desc:'Unlimited reps · Multi-territory · Priority support',           link:'https://buy.stripe.com/3cI3cv9i20z28cq51wgjC05' }
};

// ── localStorage Keys ─────────────────────────────────────────────────────────
const BILLING_KEY = 'm2_billing_v1';
const OB_KEY      = 'm2_onboard_v1';
const STORE       = 'm2_original_stack_restored_v1';
const SETTINGS    = 'm2_settings_restored_v1';
const ACCOUNT     = 'm2_account_access_restored_v1';
const SESSION     = 'm2_session_restored_v1';
const BACKUPS     = 'm2_backups_restored_v1';
const CHECKS      = 'm2_checks_restored_v1';
const SUBS        = 'm2_customer_accounts_restored_v1';
const CONTACT     = 'm2_demo_contact_restored_v1';
const AFTER       = 'm2_after_disposition_restored_v1';
const QUEUE_KEY   = 'm2_offline_queue_v1';

// ── External API ──────────────────────────────────────────────────────────────
const PLUTO = 'https://data.cityofnewyork.us/resource/64uk-42ks.json';

// ── Lead Dispositions ─────────────────────────────────────────────────────────
const DISP = [
  ['knocked','✊','Knocked'], ['not_home','🚪','Not Home'], ['interested','🔥','Interested'],
  ['callback','📞','Callback'], ['set','🎯','Appt Set'], ['sat','🪑','Sat'],
  ['closed','💰','Closed'], ['not_qualified','⚠️','Not Qualified'],
  ['do_not_knock','⛔','Do Not Knock'], ['not_interested','❌','Not Interested']
];
const LABEL = {
  fresh:'Fresh', knocked:'Knocked', not_home:'Not Home', interested:'Interested',
  callback:'Callback', set:'Appt Set', sat:'Sat', closed:'Closed',
  not_qualified:'Not Qualified', do_not_knock:'Do Not Knock', not_interested:'Not Interested'
};

// ── NYC Neighborhoods ─────────────────────────────────────────────────────────
const NEIGHBORHOODS = {
  queens: [
    ['Rosedale / Laurelton', [40.650,-73.775,40.690,-73.725]],
    ['Jamaica / Hollis',     [40.690,-73.810,40.720,-73.760]],
    ['Queens Village',       [40.710,-73.770,40.745,-73.720]],
    ['Bayside / Whitestone', [40.760,-73.800,40.795,-73.745]],
    ['Flushing',             [40.745,-73.840,40.785,-73.795]],
    ['Ozone Park',           [40.670,-73.860,40.695,-73.830]],
    ['Forest Hills',         [40.715,-73.860,40.735,-73.830]]
  ],
  brooklyn: [
    ['Canarsie',     [40.620,-73.910,40.650,-73.870]],
    ['Flatlands',    [40.620,-73.945,40.640,-73.910]],
    ['Marine Park',  [40.595,-73.945,40.625,-73.900]],
    ['Bed-Stuy',     [40.680,-73.960,40.700,-73.920]],
    ['Crown Heights',[40.665,-73.960,40.685,-73.920]]
  ]
};

// ── Solar GHI Data (Queens & Brooklyn ZIPs — NREL TMY kWh/m²/day) ────────────
const NYC_GHI = {'11001':4.41,'11003':4.38,'11004':4.41,'11005':4.38,'11101':4.25,'11102':4.25,'11103':4.25,'11104':4.25,'11105':4.25,'11106':4.25,'11354':4.32,'11355':4.32,'11356':4.32,'11357':4.35,'11358':4.35,'11359':4.38,'11360':4.38,'11361':4.38,'11362':4.35,'11363':4.35,'11364':4.35,'11365':4.32,'11366':4.32,'11367':4.32,'11368':4.28,'11369':4.28,'11370':4.28,'11371':4.28,'11372':4.28,'11373':4.28,'11374':4.28,'11375':4.28,'11377':4.28,'11378':4.28,'11379':4.30,'11385':4.30,'11411':4.38,'11412':4.38,'11413':4.41,'11414':4.33,'11415':4.33,'11416':4.33,'11417':4.33,'11418':4.33,'11419':4.35,'11420':4.35,'11421':4.33,'11422':4.40,'11423':4.38,'11426':4.41,'11427':4.38,'11428':4.38,'11429':4.38,'11430':4.38,'11432':4.33,'11433':4.35,'11434':4.38,'11435':4.35,'11436':4.35,'11691':4.35,'11692':4.35,'11693':4.35,'11694':4.35,'11697':4.38,'11201':4.22,'11203':4.25,'11204':4.25,'11205':4.22,'11206':4.22,'11207':4.25,'11208':4.25,'11209':4.20,'11210':4.25,'11211':4.22,'11212':4.25,'11213':4.25,'11214':4.20,'11215':4.22,'11216':4.22,'11217':4.22,'11218':4.22,'11219':4.20,'11220':4.20,'11221':4.22,'11222':4.22,'11223':4.22,'11224':4.20,'11225':4.22,'11226':4.22,'11228':4.20,'11229':4.22,'11230':4.22,'11231':4.22,'11232':4.20,'11233':4.25,'11234':4.25,'11235':4.20,'11236':4.25,'11237':4.22,'11238':4.22,'11239':4.25};

// ── Live Tracking ─────────────────────────────────────────────────────────────
let trackInterval = null, agentDots = {}, agentColorIdx = 0, agentColorMap = {};
const AGENT_COLORS = ['#58a6ff','#3fb950','#a371f7','#f85149','#f9c74f','#39d0d8','#fb923c'];
function agentColor(n) {
  if (!agentColorMap[n]) agentColorMap[n] = AGENT_COLORS[agentColorIdx++ % AGENT_COLORS.length];
  return agentColorMap[n];
}

// ── Route State ───────────────────────────────────────────────────────────────
let routeMarkers = [], routePolyline = null;
