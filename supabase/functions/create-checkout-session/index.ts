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

  let checkoutIntentId: string | null = null

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

    const { data: checkoutIntentRows, error: checkoutIntentError } = await adminClient.rpc(
      'claim_billing_checkout_intent',
      { p_user_id: authenticatedUser.id },
    )
    if (checkoutIntentError) throw checkoutIntentError
    const checkoutIntent = Array.isArray(checkoutIntentRows)
      ? checkoutIntentRows[0]
      : checkoutIntentRows
    if (!checkoutIntent?.id || !checkoutIntent?.idempotency_key) {
      throw new Error('Failed to claim a billing checkout intent')
    }
    checkoutIntentId = checkoutIntent.id

    if (checkoutIntent.status === 'open' && checkoutIntent.checkout_url) {
      return jsonResponse({ url: checkoutIntent.checkout_url, reused: true })
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

    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60
    const session = await stripe.checkout.sessions.create(
      {
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
        expires_at: sessionExpiresAt,
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
      },
      { idempotencyKey: String(checkoutIntent.idempotency_key) },
    )

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    const { error: openIntentError } = await adminClient.rpc(
      'open_billing_checkout_intent',
      {
        p_intent_id: checkoutIntent.id,
        p_stripe_session_id: session.id,
        p_checkout_url: session.url,
        p_expires_at: new Date(sessionExpiresAt * 1000).toISOString(),
      },
    )
    if (openIntentError) throw openIntentError

    return jsonResponse({ url: session.url })
  } catch (error) {
    console.error('create-checkout-session error', error)
    if (checkoutIntentId) {
      try {
        const adminClient = createAdminClient()
        await adminClient.rpc('fail_billing_checkout_intent', {
          p_intent_id: checkoutIntentId,
        })
      } catch (intentError) {
        console.error('create-checkout-session intent cleanup error', intentError)
      }
    }
    return jsonResponse({ error: 'Failed to create checkout session' }, 500)
  }
})
