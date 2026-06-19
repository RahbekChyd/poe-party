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

async function claimBillingEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  event: { id: string; type: string; created?: number },
): Promise<'claimed' | 'duplicate'> {
  const stripeCreatedAt = fromStripeCreated(event.created)
  const { error: insertError } = await adminClient.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    stripe_created_at: stripeCreatedAt,
    processing_status: 'processing',
  })

  if (!insertError) return 'claimed'

  if (insertError.code !== '23505') {
    throw insertError
  }

  const { data: existingEvent, error: existingEventError } = await adminClient
    .from('billing_events')
    .select('processing_status')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existingEventError) throw existingEventError
  if (
    existingEvent?.processing_status === 'processed' ||
    existingEvent?.processing_status === 'processing' ||
    existingEvent?.processing_status === 'ignored'
  ) {
    return 'duplicate'
  }

  const { error: updateError } = await adminClient
    .from('billing_events')
    .update({
      processing_status: 'processing',
      error_message: null,
    })
    .eq('stripe_event_id', event.id)

  if (updateError) throw updateError
  return 'claimed'
}

async function finishBillingEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  eventId: string,
  status: 'processed' | 'failed' | 'ignored',
  errorMessage: string | null = null,
) {
  const { error } = await adminClient
    .from('billing_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('stripe_event_id', eventId)

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
    ) as StripeWebhookEvent
  } catch (error) {
    console.error('stripe-webhook signature error', error)
    return new Response('bad signature', { status: 400 })
  }

  const adminClient = createAdminClient()
  const eventCreatedAt = fromStripeCreated(event.created)

  try {
    const claimStatus = await claimBillingEvent(adminClient, event)
    if (claimStatus === 'duplicate') {
      return jsonResponse({ received: true, duplicate: true })
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
        await finishBillingEvent(adminClient, event.id, 'ignored')
        return jsonResponse({ received: true, ignored: true })
    }

    await finishBillingEvent(adminClient, event.id, 'processed')
    return jsonResponse({ received: true })
  } catch (error) {
    const errorMessage = toErrorMessage(error).slice(0, 1000)
    console.error('stripe-webhook processing error', error)
    try {
      await finishBillingEvent(adminClient, event.id, 'failed', errorMessage)
    } catch (eventUpdateError) {
      console.error('stripe-webhook failed to record failure', eventUpdateError)
    }
    return jsonResponse({ error: 'Failed to process Stripe event' }, 500)
  }
})
