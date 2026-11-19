import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { Check, Info } from 'lucide-react'
import { Link, useSearch } from '@tanstack/react-router'
import { useMyProfile } from '../../hooks/useCurrentUser'
import { useCreateBillingPortalSession, useCreateCheckoutSession } from '../../hooks/useBilling'
import {
  FREE_DAILY_UPGRADE_ANALYSIS_LIMIT,
  PLAN_PRICE_LABELS,
  SNAPSHOT_LIMITS,
  hasActiveProAccess,
  isBillingAvailableForProfile,
} from '../../lib/billing'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { HoverTooltip } from '../ui/hover-tooltip'
const RAW_SNAPSHOT_RETENTION_HELP =
  'This account-wide limit applies to full stash details. Wealth summaries can stay available after those details expire.'

const PLAN_FEATURES = {
  free: [
    `${SNAPSHOT_LIMITS.free} retained raw snapshots across all groups`,
    'Manual stash snapshots',
    'Economy, members, strategies, services, and gear planning',
    `${FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} signed-in upgrade analyses per UTC day`,
  ],
  pro: [
    `${SNAPSHOT_LIMITS.pro} retained raw snapshots across all groups`,
    'Interval and Mix snapshot scheduling',
    'No daily app limit on signed-in upgrade analysis',
    'Everything included in Community',
  ],
} as const

const RAW_SNAPSHOT_FEATURES = new Set<string>([PLAN_FEATURES.free[0], PLAN_FEATURES.pro[0]])

const CHECKOUT_CONFIRMATION_POLL_MS = 2000
const CHECKOUT_CONFIRMATION_TIMEOUT_MS = 60_000

function formatExpiry(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function SupportPage() {
  const search = useSearch({ strict: false }) as { checkout?: string }
  const { data: profile, refetch: refetchProfile, isFetching: checkingAccess } = useMyProfile()
  const [billingError, setBillingError] = useState<string | null>(null)
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false)
  const checkout = useCreateCheckoutSession()
  const portal = useCreateBillingPortalSession()
  const isPro = hasActiveProAccess(profile)
  const isBillingAvailable = isBillingAvailableForProfile(profile)
  const canStartCheckout = isBillingAvailable && !isPro
  const isConfirmingCheckout = search.checkout === 'success' && !isPro && !confirmationTimedOut
  const expiresLabel = useMemo(
    () => formatExpiry(profile?.subscription_expires_at),
    [profile?.subscription_expires_at],
  )

  useEffect(() => {
    if (search.checkout !== 'success' || isPro) {
      setConfirmationTimedOut(false)
      return
    }

    setConfirmationTimedOut(false)
    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      if (Date.now() - startedAt >= CHECKOUT_CONFIRMATION_TIMEOUT_MS) {
        setConfirmationTimedOut(true)
        window.clearInterval(interval)
        return
      }

      void refetchProfile()
    }, CHECKOUT_CONFIRMATION_POLL_MS)

    void refetchProfile()
    return () => window.clearInterval(interval)
  }, [isPro, refetchProfile, search.checkout])

  const startCheckout = async () => {
    setBillingError(null)
    try {
      const url = await checkout.mutateAsync()
      window.location.assign(url)
    } catch {
      setBillingError('Couldn’t open checkout. Try again.')
    }
  }

  const openPortal = async () => {
    setBillingError(null)
    try {
      const url = await portal.mutateAsync()
      window.location.assign(url)
    } catch {
      setBillingError('Couldn’t open billing settings. Try again.')
    }
  }

  return (
    <DashboardPage className="max-w-5xl">
      <DashboardPageHeader
        title="Support PoE Party"
        tone="warning"
        description="Supporter subscriptions help fund hosting and open-source development."
        actions={
          <Chip className="px-2" color={isPro ? 'warning' : 'default'} variant="soft">
            Current: {isPro ? 'Supporter' : 'Community'}
          </Chip>
        }
      />

      {search.checkout === 'success' && (
        <Card className="border-success/30 bg-success/10 border">
          <Card.Content className="p-5" role="status">
            <p className="text-foreground text-sm font-semibold">{isPro ? 'Supporter access active' : 'Confirming Supporter access'}</p>
            <p className="text-default-500 mt-1 text-sm">
              {isPro
                ? 'Thanks for supporting PoE Party.'
                : confirmationTimedOut
                  ? 'Confirmation is taking longer than expected. Check your access again in a moment.'
                  : 'This page will update when your access is confirmed.'}
            </p>
            {isConfirmingCheckout && (
              <Chip size="sm" color="warning" variant="soft" className="mt-3 self-start">
                Confirming billing
              </Chip>
            )}
            {confirmationTimedOut && !isPro && (
              <Button size="sm" variant="tertiary" className="mt-3 self-start" isPending={checkingAccess} onPress={() => void refetchProfile()}>
                Check access again
              </Button>
            )}
          </Card.Content>
        </Card>
      )}

      {search.checkout === 'cancel' && (
        <Card className="border-warning/30 bg-warning/10 border">
          <Card.Content className="p-5" role="status">
            <p className="text-foreground text-sm font-semibold">Support checkout canceled</p>
            <p className="text-default-500 mt-1 text-sm">
              You can return to checkout any time.
            </p>
          </Card.Content>
        </Card>
      )}

      {billingError && (
        <Card className="border-danger/30 bg-danger/10 border">
          <Card.Content className="p-5" role="alert">
            <p className="text-foreground text-sm font-semibold">Billing action failed</p>
            <p className="text-default-500 mt-1 text-sm">{billingError}</p>
          </Card.Content>
        </Card>
      )}

      <Card>
        <Card.Content className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-foreground text-sm font-semibold">
              {isPro ? 'Your Supporter access' : 'Your Community access'}
            </p>
            <p className="text-default-400 mt-1 text-sm">
              {isPro
                ? expiresLabel
                  ? `Your Supporter access is active through ${expiresLabel}.`
                  : 'Your Supporter access has no scheduled expiration.'
                : isBillingAvailable
                  ? 'You can subscribe through Stripe Checkout.'
                  : 'Supporter checkout is currently unavailable for your account.'}
            </p>
          </div>
          <Link
            to="/legal/faq"
            hash="snapshot-limits"
            className="text-primary text-sm font-medium hover:underline"
          >
            Snapshot limits FAQ
          </Link>
        </Card.Content>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={!isPro ? 'ring-primary ring-2' : ''}>
          <Card.Header className="flex items-start justify-between gap-3 px-5 pt-5 pb-0">
            <div>
              <h2 className="text-foreground text-lg font-semibold">Community</h2>
              <p className="text-default-400 mt-1 text-sm">
                Core workspace and public community tools.
              </p>
            </div>
            {!isPro && (
              <Chip size="sm" color="accent" variant="soft">
                Active
              </Chip>
            )}
          </Card.Header>
          <Card.Content className="gap-4 p-5">
            <div className="text-foreground text-3xl font-semibold">{PLAN_PRICE_LABELS.free}</div>
            <div className="flex flex-col gap-3">
              {PLAN_FEATURES.free.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm">
                  <Check size={16} className="text-success mt-0.5 shrink-0" />
                  <span className="text-default-600">
                    {feature}
                    {RAW_SNAPSHOT_FEATURES.has(feature) ? (
                      <HoverTooltip
                        as="span"
                        className="relative ml-1 inline-flex align-[-2px]"
                        content={RAW_SNAPSHOT_RETENTION_HELP}
                        contentClassName="w-72"
                        placement="top"
                      >
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label="Raw snapshot retention details"
                          className="text-default-400 hover:text-default-600 focus-visible:ring-primary/40 inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <Info size={13} />
                        </span>
                      </HoverTooltip>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>

        <Card className={isPro ? 'ring-warning ring-2' : ''}>
          <Card.Header className="flex items-start justify-between gap-3 px-5 pt-5 pb-0">
            <div>
              <h2 className="text-foreground text-lg font-semibold">Supporter</h2>
              <p className="text-default-400 mt-1 text-sm">
                Keep more stash snapshots and schedule them automatically.
              </p>
            </div>
            {isPro && (
              <Chip size="sm" color="warning" variant="soft">
                Active
              </Chip>
            )}
          </Card.Header>
          <Card.Content className="gap-4 p-5">
            <div className="flex items-center gap-2">
              <span className="text-foreground text-3xl font-semibold">
                {PLAN_PRICE_LABELS.pro}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {PLAN_FEATURES.pro.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm">
                  <Check size={16} className="text-success mt-0.5 shrink-0" />
                  <span className="text-default-600">
                    {feature}
                    {RAW_SNAPSHOT_FEATURES.has(feature) ? (
                      <HoverTooltip
                        as="span"
                        className="relative ml-1 inline-flex align-[-2px]"
                        content={RAW_SNAPSHOT_RETENTION_HELP}
                        contentClassName="w-72"
                        placement="top"
                      >
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label="Raw snapshot retention details"
                          className="text-default-400 hover:text-default-600 focus-visible:ring-primary/40 inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <Info size={13} />
                        </span>
                      </HoverTooltip>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            <Button
              variant={isPro ? 'tertiary' : 'primary'}
              isPending={isPro ? portal.isPending : checkout.isPending}
              isDisabled={!isPro && !canStartCheckout}
              onPress={isPro ? openPortal : canStartCheckout ? startCheckout : undefined}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPro
                    ? 'Manage billing'
                    : canStartCheckout
                      ? `Support for ${PLAN_PRICE_LABELS.pro}`
                      : 'Unavailable'}
                </>
              )}
            </Button>
          </Card.Content>
        </Card>
      </div>
    </DashboardPage>
  )
}
