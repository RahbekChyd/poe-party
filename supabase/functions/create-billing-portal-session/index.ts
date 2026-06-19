import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'
import { createStripeClient } from '../_shared/stripe.ts'
import { getReturnOrigin } from '../_shared/billing.ts'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const adminClient = createAdminClient()
    const stripe = createStripeClient()
    const { data: billingCustomer, error: billingCustomerError } = await adminClient
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', authenticatedUser.id)
      .maybeSingle()

    if (billingCustomerError) throw billingCustomerError
    if (!billingCustomer?.stripe_customer_id) {
      return jsonResponse({ error: 'No Stripe billing profile exists for this account.' }, 404)
    }

    const configuration = Deno.env.get('STRIPE_BILLING_PORTAL_CONFIGURATION_ID') ?? undefined
    const session = await stripe.billingPortal.sessions.create({
      customer: billingCustomer.stripe_customer_id,
      return_url: `${getReturnOrigin(req)}/dashboard/support`,
      ...(configuration ? { configuration } : {}),
    })

    return jsonResponse({ url: session.url })
  } catch (error) {
    console.error('create-billing-portal-session error', error)
    return jsonResponse({ error: 'Failed to create billing portal session' }, 500)
  }
})
