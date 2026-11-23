import { useState } from 'react'
import { Avatar } from '@heroui/react/avatar'
import { Chip } from '@heroui/react/chip'
import { Dropdown } from '@heroui/react/dropdown'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../../lib/supabase'
import { GroupSwitcher } from '../groups/GroupSwitcher'
import { useGroupStore } from '../../store/group-store'
import { useLatestSnapshots } from '../../hooks/useSnapshots'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { useCharacterSyncFlow } from '../../hooks/useCharacterSyncFlow'
import { useSnapshotSchedule } from '../../hooks/useSnapshotSchedule'
import { useSnapshotStore } from '../../store/snapshot-store'
import { useCurrencyStore } from '../../store/currency-store'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { useEarlyAccessNoticeStore } from '../../store/early-access-notice-store'
import { hasActiveProAccess, isBillingAvailableForProfile } from '../../lib/billing'
import { WorkspaceBrand } from './WorkspaceFrame'
import { AnalysisNotificationsMenu } from './AnalysisNotificationsMenu'

export function Navbar() {
  const navigate = useNavigate()
  const { display: currencyDisplay, toggle: toggleCurrency } = useCurrencyStore()
  const [signOutError, setSignOutError] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { capabilities } = useActiveGroupContext(activeGroupId)
  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const { isBusy } = useCharacterSyncFlow()
  const { progress } = useSnapshotStore()
  const { countdownLabel, isEligible, mode } = useSnapshotSchedule(activeGroupId)

  const { data: user } = useCurrentUser()
  const currentUserId = user?.id ?? null
  const { data: profile } = useMyProfile()
  const openEarlyAccessNotice = useEarlyAccessNoticeStore((s) => s.open)

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
          <WorkspaceBrand to="/dashboard" className="hidden sm:inline-flex" />
          <GroupSwitcher />
        </div>

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

          {capabilities?.supportsOptimizer ? (
            <AnalysisNotificationsMenu groupId={activeGroupId} userId={currentUserId} />
          ) : null}

          {capabilities?.supportsStashSnapshots ? (
            <div className="hidden min-w-0 items-center lg:inline-flex">
              <Chip
                className={`h-8 max-w-44 justify-start px-3 xl:max-w-52 ${snapshotIsInformational ? 'bg-info-soft text-info' : ''}`}
                size="sm"
                variant="soft"
                color={snapshotIsInformational ? 'default' : freshnessColor}
              >
                <span className="truncate">{chipLabel}</span>
              </Chip>
            </div>
          ) : null}

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
                  {capabilities?.supportsStashSnapshots ? (
                    <Dropdown.Item
                      id="snapshot-status"
                      onAction={() => navigate({ to: '/dashboard/economy' })}
                    >
                      {chipLabel}
                    </Dropdown.Item>
                  ) : null}
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
