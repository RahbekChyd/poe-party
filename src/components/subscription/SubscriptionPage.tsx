import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { Check, HeartHandshake, Info } from 'lucide-react'
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
  'PoE Party can still keep summary history for wealth charts and totals after raw retention runs. This limit is for full item-level snapshot details, such as tabs and priced item rows, across all groups on your account.'

const PLAN_FEATURES = {
  free: [
    `${SNAPSHOT_LIMITS.free} retained raw snapshots across all groups`,
    'Manual stash snapshots',
    'Core workspace for economy, members, strategies, services, and gear planning',
    `Public and community features, plus ${FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} authenticated upgrade-analysis queues per UTC day`,
  ],
  pro: [
    `${SNAPSHOT_LIMITS.pro} retained raw snapshots across all groups`,
    'Interval and Mix snapshot scheduling',
    'No app-enforced daily authenticated upgrade-analysis queue cap',
    'Support for hosting, optimizer worker capacity, public tools, and ongoing development',
    'Everything included in Community',
  ],
} as const

const RAW_SNAPSHOT_FEATURES = new Set<string>([
  PLAN_FEATURES.free[0],
  PLAN_FEATURES.pro[0],
])

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
  const { data: profile, refetch: refetchProfile } = useMyProfile()
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
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Failed to start checkout.')
    }
  }

  const openPortal = async () => {
    setBillingError(null)
    try {
      const url = await portal.mutateAsync()
      window.location.assign(url)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Failed to open billing portal.')
    }
  }

  return (
    <DashboardPage className="max-w-5xl">
      <DashboardPageHeader
        title="Support PoE Party"
        eyebrow="Community-funded capacity"
        tone="warning"
        description="PoE Party stays useful for Community users. Optional Supporter subscriptions help pay for hosting, optimizer worker capacity, public tools, and ongoing development."
        actions={
          <Chip className="px-2" color={isPro ? 'warning' : 'default'} variant="soft">
            Current: {isPro ? 'Supporter' : 'Community'}
          </Chip>
        }
      />

      {search.checkout === 'success' && (
        <Card className="border-success/30 bg-success/10 border">
          <Card.Content className="p-5">
            <p className="text-foreground text-sm font-semibold">Support checkout completed</p>
            <p className="text-default-500 mt-1 text-sm">
              {isPro
                ? 'Supporter access is active.'
                : confirmationTimedOut
                  ? 'Stripe has not confirmed Supporter access yet. Check webhook delivery if this does not update soon.'
                  : 'Stripe is confirming Supporter access. This page will update after the webhook syncs.'}
            </p>
            {isConfirmingCheckout && (
              <Chip size="sm" color="success" variant="soft" className="mt-3">
                Confirming billing
              </Chip>
            )}
          </Card.Content>
        </Card>
      )}

      {search.checkout === 'cancel' && (
        <Card className="border-warning/30 bg-warning/10 border">
          <Card.Content className="p-5">
            <p className="text-foreground text-sm font-semibold">Support checkout canceled</p>
            <p className="text-default-500 mt-1 text-sm">
              No payment was completed and your Community access is unchanged.
            </p>
          </Card.Content>
        </Card>
      )}

      {billingError && (
        <Card className="border-danger/30 bg-danger/10 border">
          <Card.Content className="p-5">
            <p className="text-foreground text-sm font-semibold">Billing action failed</p>
            <p className="text-default-500 mt-1 text-sm">{billingError}</p>
          </Card.Content>
        </Card>
      )}

      <Card>
        <Card.Content className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-foreground text-sm font-semibold">
              {isPro ? 'Supporter access is active' : 'Community access stays available'}
            </p>
            <p className="text-default-400 mt-1 text-sm">
              {isPro
                ? expiresLabel
                  ? `Your Supporter access is active through ${expiresLabel}.`
                  : 'Your Supporter access is active with no scheduled expiration in PoE Party.'
                : isBillingAvailable
                  ? 'Support PoE Party with Stripe Checkout when you want to help cover shared capacity.'
                  : 'Billing is not available for this account while an operator account gate is enabled.'}
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

      {!isBillingAvailable && !isPro && (
        <Card className="border-warning/30 bg-warning/10 border">
          <Card.Content className="p-5">
            <p className="text-foreground text-sm font-semibold">Billing unavailable</p>
            <p className="text-default-500 mt-1 text-sm">
              Supporter checkout is public, but this deployment has an operator account gate
              enabled.
            </p>
          </Card.Content>
        </Card>
      )}

      <Card>
        <Card.Content className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-danger/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <HeartHandshake size={18} className="text-danger" />
            </div>
            <div>
              <p className="text-foreground text-sm font-semibold">Support development</p>
              <p className="text-default-400 mt-1 text-sm">
                Supporter subscriptions fund hosting, optimizer worker capacity, public tools, and
                the next round of PoE Party development.
              </p>
            </div>
          </div>
          <Chip color="danger" variant="soft">
            Stripe billing
          </Chip>
        </Card.Content>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={!isPro ? 'ring-primary ring-2' : ''}>
          <Card.Header className="flex items-start justify-between gap-3 px-5 pt-5 pb-0">
            <div>
              <p className="text-foreground text-lg font-semibold">Community</p>
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
            <Button variant="tertiary" isDisabled>
              {isPro ? 'Included for Supporters' : 'Current access'}
            </Button>
          </Card.Content>
        </Card>

        <Card className={isPro ? 'ring-warning ring-2' : ''}>
          <Card.Header className="flex items-start justify-between gap-3 px-5 pt-5 pb-0">
            <div>
              <p className="text-foreground text-lg font-semibold">Supporter</p>
              <p className="text-default-400 mt-1 text-sm">
                More retained raw history and scheduling capacity for people who want to fund the
                service.
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
