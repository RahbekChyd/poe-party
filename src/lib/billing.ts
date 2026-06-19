
export type SubscriptionProfile = {
  poe_account_name?: string | null
  subscription_tier?: string | null
  subscription_expires_at?: string | null
}

export const PLAN_PRICE_LABELS = {
  free: '$0',
  pro: '$5/month',
} as const

export const SNAPSHOT_LIMITS = {
  free: 5,
  pro: 15,
} as const

export const FREE_DAILY_UPGRADE_ANALYSIS_LIMIT = 3

export function hasActiveProAccess(profile: SubscriptionProfile | null | undefined): boolean {
  if (profile?.subscription_tier !== 'pro') return false
  if (!profile.subscription_expires_at) return true

  const expiresAt = new Date(profile.subscription_expires_at).getTime()
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function normalizePoeAccountName(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function getBillingAllowedAccounts(): Set<string> | null {
  const raw = import.meta.env.VITE_BILLING_ALLOWED_POE_ACCOUNTS as string | undefined
  if (!raw) return null

  const accounts = raw
    .split(',')
    .map((entry) => normalizePoeAccountName(entry))
    .filter(Boolean)

  return new Set(accounts)
}

export function isBillingAvailableForProfile(
  profile: SubscriptionProfile | null | undefined,
): boolean {
  const allowedAccounts = getBillingAllowedAccounts()
  if (!allowedAccounts) return true
  return allowedAccounts.has(normalizePoeAccountName(profile?.poe_account_name))
}
