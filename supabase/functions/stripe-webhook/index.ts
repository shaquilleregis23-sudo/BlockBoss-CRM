import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe@18'

// ── Env vars (set via: npx supabase secrets set KEY=value) ────────────────────
const WEBHOOK_SECRET  = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const STRIPE_KEY       = Deno.env.get('STRIPE_LIVE_SECRET_KEY') ?? ''
const stripe = new Stripe(STRIPE_KEY)
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const SB_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SB_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const BREVO_KEY       = Deno.env.get('BREVO_API_KEY') ?? ''
const CRM_URL         = 'https://m2-energy-crm.netlify.app'

// ── Owner new-signup alert ────────────────────────────────────────────────────
async function sendOwnerAlert(customerEmail: string, customerName: string, planKey: string) {
  const labels: Record<string,string> = { solo:'Solo ($49/mo)', team:'Team ($149/mo)', agency:'Agency ($349/mo)' }
  const planLabel = labels[planKey] ?? planKey
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'BlockBoss CRM', email: 'shaqr@nychvacpro.com' },
        to: [{ email: 'shaquilleregis23@gmail.com', name: 'Shaquille' }],
        subject: `💰 New BlockBoss signup — ${customerName} · ${planLabel}`,
        htmlContent: `<div style="font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;max-width:480px;margin:0 auto;padding:24px">
<h2 style="color:#3fb950;margin:0 0 4px">💰 New Subscriber!</h2>
<p style="color:#8b949e;font-size:13px;margin:0 0 20px">${new Date().toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'})}</p>
<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px">
  <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #30363d;font-size:14px"><span style="color:#8b949e">Name</span><span style="font-weight:600">${customerName}</span></div>
  <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #30363d;font-size:14px"><span style="color:#8b949e">Email</span><span style="color:#58a6ff">${customerEmail}</span></div>
  <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:14px"><span style="color:#8b949e">Plan</span><span style="color:#3fb950;font-weight:700">${planLabel}</span></div>
</div>
<p style="color:#4b5563;font-size:11px;margin-top:16px;text-align:center">BlockBoss CRM · Stripe webhook</p>
</div>`,
      }),
    })
    if (!res.ok) console.error('owner alert email failed:', await res.text())
  } catch(e) { console.error('owner alert threw:', e) }
}

// ── Brevo email helper ────────────────────────────────────────────────────────
async function sendWelcomeEmail(email: string, name: string, planLabel: string, verifyToken?: string) {
  const verifySection = verifyToken
    ? `<div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:14px;margin:16px 0;text-align:center">
    <p style="margin:0 0 8px;color:#8b949e;font-size:12px;text-transform:uppercase;letter-spacing:1px">One more step</p>
    <a href="${CRM_URL}/functions/v1/verify-email?token=${verifyToken}" style="background:#1f6feb;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Verify Your Email →</a>
  </div>`
    : ''
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;max-width:560px;margin:0 auto;padding:24px">
<h1 style="color:#3fb950;margin:0 0 4px;font-size:22px">BlockBoss CRM</h1>
<p style="color:#8b949e;margin:0 0 20px;font-size:13px">Your account is ready</p>
<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px">
  <h2 style="margin:0 0 12px;font-size:18px">Welcome, ${name}! 🎉</h2>
  <p style="color:#8b949e;line-height:1.6;font-size:14px">Your <strong style="color:#58a6ff">${planLabel}</strong> plan is active. You're ready to start canvassing.</p>
  ${verifySection}
  <div style="background:#0d1117;border-radius:8px;padding:14px;margin:16px 0;text-align:center">
    <p style="margin:0 0 6px;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:1px">Your CRM</p>
    <a href="${CRM_URL}" style="color:#58a6ff;font-size:15px;font-weight:600">${CRM_URL.replace('https://','')}</a>
  </div>
  <p style="color:#8b949e;font-size:13px;line-height:1.5">Log in with your email (<strong style="color:#e6edf3">${email}</strong>) and the PIN you set during signup. Forgot your PIN? Use "Forgot PIN?" on the login screen.</p>
  <p style="text-align:center;margin:20px 0">
    <a href="${CRM_URL}" style="background:#238636;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Open BlockBoss CRM →</a>
  </p>
</div>
<p style="color:#4b5563;font-size:11px;text-align:center;margin-top:16px">BlockBoss CRM · shaqr@nychvacpro.com</p>
</body></html>`
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'BlockBoss CRM', email: 'shaqr@nychvacpro.com' },
        to: [{ email, name }],
        subject: `Welcome to BlockBoss CRM — you're live on ${planLabel}!`,
        htmlContent: html,
      }),
    })
    if (!res.ok) console.error('welcome email Brevo error:', await res.text())
  } catch (e) { console.error('welcome email threw:', e) }
}

// Stripe's official SDK validates the raw body, timestamp tolerance, and
// every v1 signature before any database mutation occurs.

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.text()
  const sig=req.headers.get('stripe-signature')??''
  let event: Stripe.Event
  try { event=await stripe.webhooks.constructEventAsync(body,sig,WEBHOOK_SECRET,300,cryptoProvider) }
  catch (error) { console.error('Stripe signature verification failed');return new Response('Invalid signature',{status:400}) }

  const sb=createClient(SB_URL,SB_SERVICE_KEY)
  const {data:prior}=await sb.from('stripe_webhook_events').select('status').eq('event_id',event.id).maybeSingle()
  if(prior?.status==='processed')return Response.json({received:true,duplicate:true})
  await sb.from('stripe_webhook_events').upsert({event_id:event.id,event_type:event.type,status:'processing',error:null,received_at:new Date().toISOString()})

  const planLimits=(raw:string)=>{const plan=String(raw||'solo').replace(/_annual$/,'');return {plan,agent_limit:plan==='agency'?999:plan==='team'?5:0,lead_limit:plan==='agency'?999999:plan==='team'?25000:5000}}
  const syncEntitlement=async(filter:'email'|'stripe_customer_id',value:string)=>{
    const {data:a}=await sb.from('master_accounts').select('team_id,plan_key,plan_status,plan_expires_at,stripe_customer_id,stripe_subscription_id').eq(filter,value).maybeSingle()
    if(!a?.team_id)return;const limits=planLimits(a.plan_key)
    await sb.from('crm_entitlements').upsert({team_id:String(a.team_id),plan_key:limits.plan,status:a.plan_status||'pending',agent_limit:limits.agent_limit,lead_limit:limits.lead_limit,period_end:a.plan_expires_at||null,stripe_customer_id:a.stripe_customer_id||null,stripe_subscription_id:a.stripe_subscription_id||null,source:'stripe_webhook',updated_at:new Date().toISOString()})
  }

  // Helper: update master_accounts row by email
  const patchByEmail = async (email: string, patch: Record<string, unknown>) => {
    const { error } = await sb
      .from('master_accounts')
      .update(patch)
      .eq('email', email.toLowerCase().trim())
    if (error) console.error(`patchByEmail(${email}) error:`, error.message)
    return !error
  }

  // Helper: update master_accounts row by Stripe customer ID
  const patchByCustomer = async (customerId: string, patch: Record<string, unknown>) => {
    const { error } = await sb
      .from('master_accounts')
      .update(patch)
      .eq('stripe_customer_id', customerId)
    if (error) console.error(`patchByCustomer(${customerId}) error:`, error.message)
    return !error
  }

  try {
    switch (event.type) {

      // ── Customer completed checkout (Payment Link) ────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const email: string = (session.customer_details?.email ?? session.customer_email ?? '').toLowerCase().trim()
        if (!email) { console.warn('checkout.session.completed: no email'); break }

        // client_reference_id is set by the CRM signup form
        // e.g. ?client_reference_id=solo | team | agency
        const planKey: string = session.client_reference_id ?? 'team'

        // Try to activate an existing pre-registered (pending) account
        const { data: updated, error: updateErr } = await sb
          .from('master_accounts')
          .update({
            stripe_customer_id:     session.customer,
            stripe_subscription_id: session.subscription,
            plan_key:               planKey,
            plan_status:            'active',
          })
          .ilike('email', email)
          .select('id')

        if (updateErr) console.error(`checkout update error for ${email}:`, updateErr.message)
        await syncEntitlement('email',email)

        if (updated?.length) {
          console.log(`✓ checkout.session.completed: activated existing account  email=${email}  plan=${planKey}`)
          const { data: acct } = await sb.from('master_accounts').select('name, verify_token, referred_by').ilike('email', email).single()

          // Set activated_at
          await sb.from('master_accounts').update({ activated_at: new Date().toISOString() }).ilike('email', email)

          // Award referral credit to referrer
          if (acct?.referred_by) {
            await sb.rpc('increment_referral_credits', { referrer_email: acct.referred_by }).catch(() => {
              // fallback if RPC not set up: direct update
              sb.from('master_accounts')
                .select('referral_credits')
                .eq('email', acct.referred_by)
                .single()
                .then(({ data: r }) => {
                  if (r) sb.from('master_accounts').update({ referral_credits: (r.referral_credits || 0) + 1 }).eq('email', acct.referred_by)
                })
            })
            console.log(`✓ referral credit → ${acct.referred_by}`)
          }

          const planLabels: Record<string,string> = { solo:'Solo ($49/mo)', team:'Team ($149/mo)', agency:'Agency ($349/mo)' }
          sendWelcomeEmail(email, acct?.name ?? email, planLabels[planKey] ?? planKey, acct?.verify_token ?? undefined)
          sendOwnerAlert(email, acct?.name ?? email, planKey)
          break
        }

        // No pre-registered account — someone used the Payment Link directly (edge case)
        // Create team + account automatically with a default PIN
        console.log(`checkout.session.completed: no pre-registered account for ${email} — creating`)
        const customerName: string = session.customer_details?.name ?? email
        const { data: team, error: teamErr } = await sb
          .from('teams')
          .insert({ name: customerName + "'s Team" })
          .select('id')
          .single()

        if (teamErr || !team) { console.error('Failed to create team for direct signup:', teamErr?.message); break }

        await sb.from('master_accounts').insert({
          team_id:                team.id,
          name:                   customerName,
          email:                  email,
          pin:                    '1234',
          role:                   'master',
          stripe_customer_id:     session.customer,
          stripe_subscription_id: session.subscription,
          plan_key:               planKey,
          plan_status:            'active',
        })

        const newVerifyToken = crypto.randomUUID()
        await sb.from('master_accounts').update({ verify_token: newVerifyToken }).eq('team_id', team.id)
        await syncEntitlement('email',email)
        console.log(`✓ checkout.session.completed: created new account  email=${email}  plan=${planKey}`)
        const planLabels2: Record<string,string> = { solo:'Solo ($49/mo)', team:'Team ($149/mo)', agency:'Agency ($349/mo)' }
        sendWelcomeEmail(email, customerName, planLabels2[planKey] ?? planKey, newVerifyToken)
        sendOwnerAlert(email, customerName, planKey)
        break
      }

      // ── Subscription renewed or status changed ────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const expiresAt = new Date(sub.current_period_end * 1000).toISOString()
        const status =
          sub.status === 'active'   ? 'active'   :
          sub.status === 'past_due' ? 'past_due' :
          sub.status === 'canceled' ? 'canceled' : sub.status

        await patchByCustomer(sub.customer, {
          stripe_subscription_id: sub.id,
          plan_status:            status,
          plan_expires_at:        expiresAt,
        })

        await syncEntitlement('stripe_customer_id',String(sub.customer))
        console.log(`✓ subscription.updated  customer=${sub.customer}  status=${status}  until=${expiresAt}`)
        break
      }

      // ── Subscription canceled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await patchByCustomer(sub.customer, {
          plan_status:     'canceled',
          plan_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
        })
        await syncEntitlement('stripe_customer_id',String(sub.customer))
        console.log(`✓ subscription.deleted  customer=${sub.customer}`)
        break
      }

      // ── Payment failed (past due) ─────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        await patchByCustomer(invoice.customer, {
          plan_status: 'past_due',
          payment_failed_at: new Date().toISOString(),
        })
        await syncEntitlement('stripe_customer_id',String(invoice.customer))
        console.log(`✓ payment_failed  customer=${invoice.customer}`)
        break
      }

      // ── Payment recovered (was past due, now paid) ────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_update') {
          const expiresAt = new Date(invoice.lines?.data?.[0]?.period?.end * 1000 || Date.now() + 30 * 86400000).toISOString()
          await patchByCustomer(invoice.customer, {
            plan_status:       'active',
            plan_expires_at:   expiresAt,
            payment_failed_at: null,
          })
          await syncEntitlement('stripe_customer_id',String(invoice.customer))
          console.log(`✓ payment_succeeded  customer=${invoice.customer}`)
        }
        break
      }

      default:
        console.log(`Ignored event: ${event.type}`)
    }
  } catch (err) {
    const message=String((err as Error)?.message||err).slice(0,500)
    await sb.from('stripe_webhook_events').update({status:'failed',error:message,processed_at:new Date().toISOString()}).eq('event_id',event.id)
    console.error('Handler threw:', message)
    return new Response('Internal error', { status: 500 })
  }

  await sb.from('stripe_webhook_events').update({status:'processed',processed_at:new Date().toISOString()}).eq('event_id',event.id)
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
