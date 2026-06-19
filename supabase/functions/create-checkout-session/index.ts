import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'
import { createStripeClient } from '../_shared/stripe.ts'
import {
  getEnvFlag,
  getOrCreateBillingCustomer,
  getRequiredEnv,
  getReturnOrigin,
  isBillingAllowedForPoeAccount,
} from '../_shared/billing.ts'

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
    const { data: userProfile, error: userProfileError } = await adminClient
      .from('users')
      .select('poe_account_name, subscription_tier, subscription_expires_at')
      .eq('id', authenticatedUser.id)
      .maybeSingle()

    if (userProfileError) throw userProfileError
    if (!isBillingAllowedForPoeAccount(userProfile?.poe_account_name)) {
      return jsonResponse({ error: 'Billing is not available for this account.' }, 403)
    }

    const subscriptionExpiresAt = userProfile?.subscription_expires_at
      ? new Date(userProfile.subscription_expires_at)
      : null
    const hasActivePro =
      userProfile?.subscription_tier === 'pro' &&
      (!subscriptionExpiresAt ||
        (Number.isFinite(subscriptionExpiresAt.getTime()) && subscriptionExpiresAt > new Date()))

    if (hasActivePro) {
      return jsonResponse(
        { error: 'Supporter access is already active. Manage billing from the support page.' },
        409,
      )
    }

    const { data: existingSubscription, error: existingSubscriptionError } = await adminClient
      .from('billing_subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', authenticatedUser.id)
      .eq('plan_key', 'pro')
      .in('status', ['active', 'trialing'])
      .limit(1)
      .maybeSingle()

    if (existingSubscriptionError) throw existingSubscriptionError
    if (existingSubscription?.stripe_subscription_id) {
      return jsonResponse(
        { error: 'Supporter access is already active. Manage billing from the support page.' },
        409,
      )
    }

    const stripe = createStripeClient()
    const proPriceId = getRequiredEnv('STRIPE_PRO_PRICE_ID')
    const returnOrigin = getReturnOrigin(req)
    const stripeCustomerId = await getOrCreateBillingCustomer(
      adminClient,
      stripe,
      authenticatedUser,
    )
    const allowPromotionCodes = getEnvFlag('STRIPE_ALLOW_PROMOTION_CODES', false)
    const automaticTaxEnabled = getEnvFlag('STRIPE_AUTOMATIC_TAX_ENABLED', false)
    const automaticTaxCheckoutOptions = automaticTaxEnabled
      ? {
          billing_address_collection: 'required' as const,
          customer_update: {
            address: 'auto' as const,
            name: 'auto' as const,
          },
          tax_id_collection: {
            enabled: true,
          },
        }
      : {}

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: authenticatedUser.id,
      line_items: [
        {
          price: proPriceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: allowPromotionCodes,
      automatic_tax: {
        enabled: automaticTaxEnabled,
      },
      ...automaticTaxCheckoutOptions,
      success_url: `${returnOrigin}/dashboard/support?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/dashboard/support?checkout=cancel`,
      metadata: {
        user_id: authenticatedUser.id,
        plan_key: 'pro',
      },
      subscription_data: {
        metadata: {
          user_id: authenticatedUser.id,
          plan_key: 'pro',
        },
      },
    })

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    return jsonResponse({ url: session.url })
  } catch (error) {
    console.error('create-checkout-session error', error)
    return jsonResponse({ error: 'Failed to create checkout session' }, 500)
  }
})
