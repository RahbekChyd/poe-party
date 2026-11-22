import { useEffect, useState } from 'react'
import { Avatar } from '@heroui/react/avatar'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Dropdown } from '@heroui/react/dropdown'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { Link, useNavigate } from '@tanstack/react-router'
import { FlaskConical, Moon, Sun } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GroupSwitcher } from '../groups/GroupSwitcher'
import { useThemeStore } from '../../store/theme-store'
import { useGroupStore } from '../../store/group-store'
import { useLatestSnapshots } from '../../hooks/useSnapshots'
import { useCharacterSyncFlow } from '../../hooks/useCharacterSyncFlow'
import { useSnapshotSchedule } from '../../hooks/useSnapshotSchedule'
import { useSnapshotStore } from '../../store/snapshot-store'
import { useCurrencyStore } from '../../store/currency-store'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { useEarlyAccessNoticeStore } from '../../store/early-access-notice-store'
import { useMyLatestAnalysisRuns } from '../../hooks/useGearOptimizer'
import { hasActiveProAccess, isBillingAvailableForProfile } from '../../lib/billing'
import { WorkspaceEngraving } from './WorkspaceFrame'
export function Navbar() {
  const navigate = useNavigate()
  const { theme, toggle, setTheme } = useThemeStore()
  const { display: currencyDisplay, toggle: toggleCurrency } = useCurrencyStore()
  const [signOutError, setSignOutError] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const { isBusy } = useCharacterSyncFlow()
  const { progress } = useSnapshotStore()
  const { countdownLabel, isEligible, mode } = useSnapshotSchedule(activeGroupId)

  const { data: user } = useCurrentUser()
  const currentUserId = user?.id ?? null
  const { data: profile } = useMyProfile()
  const openEarlyAccessNotice = useEarlyAccessNoticeStore((s) => s.open)

  // Sync theme from DB when profile loads
  useEffect(() => {
    if (profile?.theme && (profile.theme === 'light' || profile.theme === 'dark')) {
      setTheme(profile.theme)
    }
  }, [profile?.theme, setTheme])

  const handleThemeToggle = async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    toggle()
    if (currentUserId) {
      await supabase.from('users').update({ theme: next }).eq('id', currentUserId)
    }
  }

  const { data: myLatestRuns } = useMyLatestAnalysisRuns(activeGroupId, currentUserId)

  const liveRun = myLatestRuns?.find((r) => r.status === 'queued' || r.status === 'running') ?? null
  const recentlyCompletedRun = !liveRun
    ? (myLatestRuns?.find((r) => {
        if (r.status !== 'completed' && r.status !== 'partial') return false
        if (!r.completed_at) return false
        return Date.now() - new Date(r.completed_at).getTime() < 30 * 60 * 1000
      }) ?? null)
    : null

  const analysisChipLabel = liveRun
    ? liveRun.status === 'queued'
      ? 'Analysis queued'
      : 'Analysis running'
    : recentlyCompletedRun?.status === 'partial'
      ? 'Partial analysis ready'
      : recentlyCompletedRun
        ? 'Analysis ready'
        : null

  const mySnapshot = snapshots?.find((s) => s.user_id === currentUserId)

  const snapshotAgeMinutes = mySnapshot?.completed_at
    ? Math.floor((Date.now() - new Date(mySnapshot.completed_at).getTime()) / 60000)
    : null

  const handleSignOut = async () => {
    setSignOutError(false)
    setIsSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      await navigate({ to: '/auth/login' })
    } catch {
      setSignOutError(true)
    } finally {
      setIsSigningOut(false)
    }
  }

  const freshnessColor =
    snapshotAgeMinutes == null
      ? 'default'
      : snapshotAgeMinutes < 30
        ? 'success'
        : snapshotAgeMinutes < 120
          ? 'warning'
          : 'danger'

  const ageLabel =
    snapshotAgeMinutes == null
      ? 'No snapshot'
      : snapshotAgeMinutes < 1
        ? 'just now'
        : snapshotAgeMinutes < 60
          ? `${snapshotAgeMinutes}m ago`
          : `${Math.floor(snapshotAgeMinutes / 60)}h ago`

  const isScheduled = mode === 'mix' && isEligible
  const chipLabel = isBusy
    ? progress.message || 'Syncing…'
    : isScheduled && countdownLabel
      ? `Next snapshot: ${countdownLabel}`
      : `Last snapshot: ${ageLabel}`
  const snapshotIsInformational = isBusy || isScheduled

  const userDisplayName = profile?.display_name ?? profile?.poe_account_name ?? '?'
  const canOpenSupport = hasActiveProAccess(profile) || isBillingAvailableForProfile(profile)

  return (
    <>
      <header className="workspace-masthead">
        <div className="workspace-masthead-identity">
          <GroupSwitcher />
        </div>

        <WorkspaceEngraving />

        <div className="workspace-masthead-tools">
          <div className="hidden min-w-0 items-center sm:inline-flex">
            <ToggleButtonGroup
              aria-label="Display currency"
              size="sm"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([currencyDisplay])}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys)
                if ((value === 'chaos' || value === 'divine') && value !== currencyDisplay) {
                  toggleCurrency()
                }
              }}
            >
              <ToggleButton id="chaos">Chaos</ToggleButton>
              <ToggleButton id="divine">
                <ToggleButtonGroup.Separator />
                Divine
              </ToggleButton>
            </ToggleButtonGroup>
          </div>

          <div className="inline-flex min-w-0 items-center">
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              onPress={handleThemeToggle}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>

          {analysisChipLabel ? (
            <div className="hidden min-w-0 items-center lg:inline-flex">
              <Link
                to="/dashboard/analysis"
                className="block max-w-44 rounded-lg hover:underline"
                aria-label={analysisChipLabel}
              >
                <Chip
                  className={`h-8 max-w-44 cursor-pointer justify-start px-3 ${liveRun ? 'bg-info-soft text-info' : ''}`}
                  size="sm"
                  variant="soft"
                  color={liveRun ? 'default' : recentlyCompletedRun?.status === 'partial' ? 'warning' : 'success'}
                >
                  {liveRun ? (
                    <span className="mr-1.5 size-2 shrink-0 animate-pulse rounded-full bg-info" aria-hidden="true" />
                  ) : (
                    <FlaskConical size={12} className="mr-1.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{analysisChipLabel}</span>
                </Chip>
              </Link>
            </div>
          ) : null}

          <div className="hidden min-w-0 items-center xl:inline-flex">
            <Chip
              className={`h-8 max-w-52 justify-start px-3 ${snapshotIsInformational ? 'bg-info-soft text-info' : ''}`}
              size="sm"
              variant="soft"
              color={snapshotIsInformational ? 'default' : freshnessColor}
            >
              <span className="truncate">{chipLabel}</span>
            </Chip>
          </div>

          <div className="inline-flex min-w-0 items-center">
            <Dropdown>
              <Dropdown.Trigger
                aria-label="Account menu"
                className="button button--sm button--tertiary button--icon-only"
              >
                <Avatar size="sm">
                  <Avatar.Fallback>{userDisplayName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
                </Avatar>
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                  <Dropdown.Item
                    id="profile"
                    textValue={userDisplayName}
                    className="text-default-500 wrap-anywhere"
                    isDisabled
                  >
                    {userDisplayName}
                  </Dropdown.Item>
                  {canOpenSupport ? (
                    <Dropdown.Item
                      id="support"
                      textValue="Support PoE Party"
                      onAction={() => navigate({ to: '/dashboard/support' })}
                    >
                      Support PoE Party
                    </Dropdown.Item>
                  ) : null}
                  <Dropdown.Item id="display-currency" onAction={toggleCurrency}>
                    Show amounts in {currencyDisplay === 'chaos' ? 'Divine Orbs' : 'Chaos Orbs'}
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="early-access"
                    textValue="Early Access"
                    onAction={openEarlyAccessNotice}
                  >
                    Early Access
                  </Dropdown.Item>
                  <Dropdown.Item
                    id="signout"
                    textValue="Sign out"
                    className="text-danger"
                    isDisabled={isSigningOut}
                    onAction={handleSignOut}
                  >
                    Sign out
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>
      </header>
      {signOutError ? (
        <p role="alert" className="text-danger border-divider/70 border-b px-4 py-2 text-sm">
          Could not sign out. Open the account menu to try again.
        </p>
      ) : null}
    </>
  )
}
