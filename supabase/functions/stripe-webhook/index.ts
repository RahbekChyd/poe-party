import { createAdminClient } from '../_shared/supabase-admin.ts'
import { createStripeClient, getStripeWebhookSecret } from '../_shared/stripe.ts'
import {
  getInvoiceSubscriptionId,
  retrieveAndSyncStripeSubscription,
  syncStripeSubscription,
} from '../_shared/billing.ts'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function fromStripeCreated(value: number | undefined): string | null {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

type StripeWebhookEvent = {
  id: string
  type: string
  created?: number
  data: { object: Record<string, unknown> }
}

async function finishBillingEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  eventId: string,
  leaseOwner: string,
  status: 'processed' | 'failed' | 'ignored',
  errorMessage: string | null = null,
) {
  const { error } = await adminClient
    .from('billing_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq('stripe_event_id', eventId)
    .eq('lease_owner', leaseOwner)

  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const stripe = createStripeClient()
  const signature = req.headers.get('stripe-signature') ?? ''
  const rawBody = await req.text()
  let event: StripeWebhookEvent

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    ) as unknown as StripeWebhookEvent
  } catch (error) {
    console.error('stripe-webhook signature error', error)
    return new Response('bad signature', { status: 400 })
  }

  const adminClient = createAdminClient()
  const eventCreatedAt = fromStripeCreated(event.created)
  const leaseOwner = crypto.randomUUID()

  try {
    const { data: claimStatus, error: claimError } = await adminClient.rpc(
      'claim_billing_event',
      {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_created_at: eventCreatedAt,
        p_lease_owner: leaseOwner,
        p_lease_seconds: 120,
      },
    )
    if (claimError) throw claimError
    if (claimStatus === 'duplicate') {
      return jsonResponse({ received: true, duplicate: true })
    }
    if (claimStatus === 'busy') {
      return jsonResponse({ error: 'Event is already being processed' }, 503)
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : typeof (session.customer as { id?: unknown } | undefined)?.id === 'string'
              ? ((session.customer as { id: string }).id)
              : null
        const userId =
          typeof session.client_reference_id === 'string'
            ? session.client_reference_id
            : typeof (session.metadata as Record<string, unknown> | undefined)?.user_id ===
                  'string'
              ? ((session.metadata as Record<string, string>).user_id)
              : null

        if (customerId && userId) {
          const { error } = await adminClient.from('billing_customers').upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
            },
            { onConflict: 'user_id' },
          )
          if (error) throw error
        }

        if (typeof session.id === 'string') {
          const { error: checkoutIntentError } = await adminClient
            .from('billing_checkout_intents')
            .update({ status: 'completed' })
            .eq('stripe_session_id', session.id)
            .in('status', ['claimed', 'open'])
          if (checkoutIntentError) throw checkoutIntentError
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : typeof (session.subscription as { id?: unknown } | undefined)?.id === 'string'
              ? ((session.subscription as { id: string }).id)
              : null

        if (subscriptionId) {
          await retrieveAndSyncStripeSubscription(
            adminClient,
            stripe,
            subscriptionId,
            eventCreatedAt,
          )
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscriptionId =
          typeof event.data.object.id === 'string' ? event.data.object.id : null
        if (!subscriptionId) throw new Error('Missing subscription id in Stripe event')
        await retrieveAndSyncStripeSubscription(
          adminClient,
          stripe,
          subscriptionId,
          eventCreatedAt,
        )
        break
      }

      case 'customer.subscription.deleted':
        await syncStripeSubscription(adminClient, stripe, event.data.object, eventCreatedAt)
        break

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subscriptionId = getInvoiceSubscriptionId(event.data.object)
        if (subscriptionId) {
          await retrieveAndSyncStripeSubscription(
            adminClient,
            stripe,
            subscriptionId,
            eventCreatedAt,
          )
        }
        break
      }

      default:
        await finishBillingEvent(adminClient, event.id, leaseOwner, 'ignored')
        return jsonResponse({ received: true, ignored: true })
    }

    await finishBillingEvent(adminClient, event.id, leaseOwner, 'processed')
    return jsonResponse({ received: true })
  } catch (error) {
    const errorMessage = toErrorMessage(error).slice(0, 1000)
    console.error('stripe-webhook processing error', error)
    try {
      await finishBillingEvent(adminClient, event.id, leaseOwner, 'failed', errorMessage)
    } catch (eventUpdateError) {
      console.error('stripe-webhook failed to record failure', eventUpdateError)
    }
    return jsonResponse({ error: 'Failed to process Stripe event' }, 500)
  }
})
