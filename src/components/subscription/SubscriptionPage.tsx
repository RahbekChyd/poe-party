import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
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
const RAW_SNAPSHOT_RETENTION_HELP =
  'This account-wide limit applies to full stash details. Wealth summaries can stay available after those details expire.'

const PLAN_COMPARISONS = [
  ['Price', PLAN_PRICE_LABELS.free, PLAN_PRICE_LABELS.pro],
  ['Retained raw snapshots across all groups', SNAPSHOT_LIMITS.free, SNAPSHOT_LIMITS.pro],
  ['Stash snapshots', 'Manual', 'Manual, Interval, and Mix scheduling'],
  ['Signed-in upgrade analysis', `${FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} per UTC day`, 'No daily app limit'],
  ['Workspace and public tools', 'Economy, members, strategies, services, and gear planning', 'Everything included in Community'],
] as const

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
        description="I run PoE Party as an open-source passion project. Community limits keep storage and computing costs manageable so the app can stay free to use. If you need more capacity, an optional Supporter subscription helps cover the extra cost."
        actions={
          <Chip className="px-2" variant="soft">
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
              <Chip size="sm" variant="soft" className="bg-info-soft text-info mt-3 self-start">
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
        <Card className="border-divider bg-info-soft border">
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
        <Card.Content className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
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
            className="text-brand-readable text-sm font-medium hover:underline"
          >
            Snapshot limits FAQ
          </Link>
        </Card.Content>
      </Card>

      <section aria-labelledby="compare-access" className="border-divider bg-content1 rounded-xl border p-4 sm:p-5">
        <h2 id="compare-access" className="text-foreground text-lg font-semibold">Compare access</h2>
        <table className="divide-divider mt-3 w-full table-fixed divide-y text-left text-sm wrap-anywhere">
          <thead>
            <tr>
              <th scope="col" className="w-[34%] py-3 pr-2 font-medium text-default-500">Feature</th>
              <th scope="col" className="px-2 py-3 text-foreground">Community</th>
              <th scope="col" className="px-2 py-3 text-foreground">Supporter</th>
            </tr>
          </thead>
          <tbody className="divide-divider divide-y">
            {PLAN_COMPARISONS.map(([label, community, supporter]) => (
              <tr key={label}>
                <th scope="row" className="py-3 pr-2 align-top font-medium text-default-600">{label}</th>
                <td className="text-foreground px-2 py-3 align-top tabular-nums">{community}</td>
                <td className="text-foreground px-2 py-3 align-top tabular-nums">{supporter}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-divider flex flex-wrap items-center justify-between gap-4 border-t pt-4">
          <p className="text-default-500 max-w-xl text-xs leading-5">{RAW_SNAPSHOT_RETENTION_HELP}</p>
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
        </div>
      </section>
    </DashboardPage>
  )
}
