import type { User } from 'https://esm.sh/@supabase/supabase-js@2.110.7'
import { createAdminClient } from './supabase-admin.ts'
import { createStripeClient } from './stripe.ts'

type AdminClient = ReturnType<typeof createAdminClient>
type StripeClient = ReturnType<typeof createStripeClient>
type StripeCustomerUpdateParams = Parameters<StripeClient['customers']['update']>[1]

type BillingProfile = {
  poe_account_name?: string | null
  display_name?: string | null
}

type StripeCustomerLike = {
  id?: string
  deleted?: boolean
  email?: string | null
  name?: string | null
  metadata?: Record<string, string | undefined> | null
}

type StripeSubscriptionLike = {
  id?: string
  customer?: string | { id?: string | null } | null
  status?: string | null
  metadata?: Record<string, string | undefined> | null
  items?: {
    data?: Array<{
      current_period_start?: number | null
      current_period_end?: number | null
      price?: { id?: string | null } | string | null
    }>
  } | null
  current_period_start?: number | null
  current_period_end?: number | null
  cancel_at_period_end?: boolean | null
}

type StripeInvoiceLike = {
  subscription?: string | { id?: string | null } | null
  parent?: {
    subscription_details?: {
      subscription?: string | { id?: string | null } | null
    } | null
  } | null
  lines?: {
    data?: Array<{
      parent?: {
        subscription_item_details?: {
          subscription?: string | { id?: string | null } | null
        } | null
      } | null
    }>
  } | null
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id.trim() ? id.trim() : null
  }
  return null
}

function fromUnixSeconds(value: unknown): string | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return new Date(parsed * 1000).toISOString()
}

function getFirstSubscriptionItem(subscription: StripeSubscriptionLike) {
  return Array.isArray(subscription.items?.data) ? subscription.items.data[0] : null
}

function getSubscriptionPriceId(subscription: StripeSubscriptionLike): string | null {
  const price = getFirstSubscriptionItem(subscription)?.price
  if (typeof price === 'string') return price
  if (price && typeof price === 'object' && typeof price.id === 'string') return price.id
  return null
}

function resolvePlanKey(priceId: string | null): string {
  const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID')
  return priceId && proPriceId && priceId === proPriceId ? 'pro' : 'unknown'
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, '')
}

function isLocalSupabaseRuntime(): boolean {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('API_URL') ?? ''
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl)
}

function getAllowedReturnOrigins(): string[] {
  const configured = Deno.env.get('BILLING_ALLOWED_RETURN_ORIGINS')
  if (!configured) {
    if (isLocalSupabaseRuntime()) {
      return ['http://localhost:5173']
    }

    throw new Error('Missing BILLING_ALLOWED_RETURN_ORIGINS')
  }

  const origins = configured.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (origins.length === 0) {
    throw new Error('BILLING_ALLOWED_RETURN_ORIGINS must include at least one origin')
  }

  return origins.map(normalizeOrigin)
}

export function getReturnOrigin(req: Request): string {
  const allowedOrigins = getAllowedReturnOrigins()
  const configuredOrigin =
    Deno.env.get('BILLING_RETURN_ORIGIN') ??
    Deno.env.get('APP_BASE_URL') ??
    Deno.env.get('SITE_URL')
  const normalizedConfiguredOrigin = configuredOrigin
    ? normalizeOrigin(configuredOrigin)
    : null
  const requestOrigin = req.headers.get('origin')
  const normalizedRequestOrigin = requestOrigin ? normalizeOrigin(requestOrigin) : null

  if (normalizedRequestOrigin && allowedOrigins.includes(normalizedRequestOrigin)) {
    return normalizedRequestOrigin
  }

  if (normalizedConfiguredOrigin && allowedOrigins.includes(normalizedConfiguredOrigin)) {
    return normalizedConfiguredOrigin
  }

  return allowedOrigins[0] ?? 'http://localhost:5173'
}

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function getEnvFlag(name: string, defaultValue = false): boolean {
  const value = Deno.env.get(name)
  if (value == null) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function normalizePoeAccountName(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function isInternalAuthEmail(value: string | null | undefined): boolean {
  const email = value?.trim().toLowerCase()
  if (!email) return false

  return (
    email.endsWith('@poe.invalid') ||
    email.endsWith('@cookie.poe-party.app') ||
    email.endsWith('@poe-party.local')
  )
}

function getStripeCustomerEmail(value: string | null | undefined): string | undefined {
  const email = value?.trim()
  if (!email || isInternalAuthEmail(email)) return undefined
  return email
}

function getBillingAllowedAccounts(): Set<string> | null {
  const raw = Deno.env.get('BILLING_ALLOWED_POE_ACCOUNTS')
  if (!raw) return null

  const accounts = raw
    .split(',')
    .map((entry) => normalizePoeAccountName(entry))
    .filter(Boolean)

  return new Set(accounts)
}

export function isBillingAllowedForPoeAccount(
  poeAccountName: string | null | undefined,
): boolean {
  const allowedAccounts = getBillingAllowedAccounts()
  if (!allowedAccounts) return true
  return allowedAccounts.has(normalizePoeAccountName(poeAccountName))
}

async function cleanExistingBillingCustomer(
  stripe: StripeClient,
  stripeCustomerId: string,
  displayName: string,
  profile: BillingProfile | null,
  userId: string,
): Promise<void> {
  const customer = (await stripe.customers.retrieve(stripeCustomerId)) as StripeCustomerLike
  if (customer.deleted) return

  const update: StripeCustomerUpdateParams = {}

  if (customer.name !== displayName) update.name = displayName

  // Stripe accepts an empty value to unset individual fields.
  if (isInternalAuthEmail(customer.email)) update.email = ''

  if (
    customer.metadata?.user_id !== userId ||
    customer.metadata?.poe_account_name !== (profile?.poe_account_name ?? '')
  ) {
    update.metadata = {
      user_id: userId,
      poe_account_name: profile?.poe_account_name ?? '',
    }
  }

  if (Object.keys(update).length > 0) {
    await stripe.customers.update(stripeCustomerId, update)
  }
}

export async function getOrCreateBillingCustomer(
  adminClient: AdminClient,
  stripe: StripeClient,
  authenticatedUser: User,
): Promise<string> {
  const { data: existingCustomer, error: existingCustomerError } = await adminClient
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', authenticatedUser.id)
    .maybeSingle()

  const { data: rawProfile } = await adminClient
    .from('users')
    .select('poe_account_name, display_name')
    .eq('id', authenticatedUser.id)
    .maybeSingle()
  const profile = rawProfile as BillingProfile | null

  const displayName =
    profile?.display_name?.trim() ||
    profile?.poe_account_name?.trim() ||
    authenticatedUser.email ||
    authenticatedUser.id

  if (existingCustomerError) throw existingCustomerError
  if (existingCustomer?.stripe_customer_id) {
    await cleanExistingBillingCustomer(
      stripe,
      existingCustomer.stripe_customer_id,
      displayName,
      profile,
      authenticatedUser.id,
    )
    return existingCustomer.stripe_customer_id
  }

  const customerEmail = getStripeCustomerEmail(authenticatedUser.email)

  const customer = await stripe.customers.create(
    {
      ...(customerEmail ? { email: customerEmail } : {}),
      name: displayName,
      metadata: {
        user_id: authenticatedUser.id,
        poe_account_name: profile?.poe_account_name ?? '',
      },
    },
    {
      idempotencyKey: `poe-party-customer-${authenticatedUser.id}`,
    },
  )

  const { error: upsertCustomerError } = await adminClient
    .from('billing_customers')
    .upsert(
      {
        user_id: authenticatedUser.id,
        stripe_customer_id: customer.id,
      },
      { onConflict: 'user_id' },
    )

  if (upsertCustomerError) throw upsertCustomerError
  return customer.id
}

async function resolveSubscriptionUserId(
  adminClient: AdminClient,
  stripe: StripeClient,
  subscription: StripeSubscriptionLike,
  customerId: string,
): Promise<string> {
  const metadataUserId = subscription.metadata?.user_id?.trim()
  if (metadataUserId && UUID_REGEX.test(metadataUserId)) return metadataUserId

  const { data: storedCustomer, error: storedCustomerError } = await adminClient
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (storedCustomerError) throw storedCustomerError
  if (storedCustomer?.user_id) return storedCustomer.user_id

  const customer = await stripe.customers.retrieve(customerId) as {
    deleted?: boolean
    metadata?: Record<string, string | undefined>
  }
  if (!customer.deleted) {
    const customerUserId = customer.metadata?.user_id?.trim()
    if (customerUserId && UUID_REGEX.test(customerUserId)) return customerUserId
  }

  throw new Error(`Unable to resolve app user for Stripe customer ${customerId}`)
}

export async function recomputeUserSubscriptionTier(
  adminClient: AdminClient,
  userId: string,
): Promise<void> {
  const { error } = await adminClient.rpc('recompute_user_subscription_tier', {
    p_user_id: userId,
  })

  if (error) throw error
}

export async function syncStripeSubscription(
  adminClient: AdminClient,
  stripe: StripeClient,
  subscription: StripeSubscriptionLike,
  eventCreatedAt: string | null,
): Promise<string> {
  const stripeSubscriptionId = subscription.id
  const stripeCustomerId = toId(subscription.customer)

  if (!stripeSubscriptionId) throw new Error('Missing Stripe subscription id')
  if (!stripeCustomerId) throw new Error('Missing Stripe customer id')

  const userId = await resolveSubscriptionUserId(
    adminClient,
    stripe,
    subscription,
    stripeCustomerId,
  )
  const priceId = getSubscriptionPriceId(subscription)
  const firstItem = getFirstSubscriptionItem(subscription)
  const planKey = resolvePlanKey(priceId)

  const { error: upsertCustomerError } = await adminClient
    .from('billing_customers')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
      },
      { onConflict: 'user_id' },
    )

  if (upsertCustomerError) throw upsertCustomerError

  const { error: upsertSubscriptionError } = await adminClient
    .from('billing_subscriptions')
    .upsert(
      {
        stripe_subscription_id: stripeSubscriptionId,
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        status: subscription.status ?? 'incomplete',
        price_id: priceId,
        plan_key: planKey,
        current_period_start: fromUnixSeconds(
          subscription.current_period_start ?? firstItem?.current_period_start,
        ),
        current_period_end: fromUnixSeconds(
          subscription.current_period_end ?? firstItem?.current_period_end,
        ),
        cancel_at_period_end: subscription.cancel_at_period_end === true,
        raw_event_updated_at: eventCreatedAt,
      },
      { onConflict: 'stripe_subscription_id' },
    )

  if (upsertSubscriptionError) throw upsertSubscriptionError
  await recomputeUserSubscriptionTier(adminClient, userId)
  return userId
}

export async function retrieveAndSyncStripeSubscription(
  adminClient: AdminClient,
  stripe: StripeClient,
  subscriptionId: string,
  eventCreatedAt: string | null,
): Promise<string> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  })
  return syncStripeSubscription(adminClient, stripe, subscription, eventCreatedAt)
}

export function getInvoiceSubscriptionId(invoice: StripeInvoiceLike): string | null {
  return (
    toId(invoice.subscription) ??
    toId(invoice.parent?.subscription_details?.subscription) ??
    toId(invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription)
  )
}
