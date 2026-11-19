import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Sword, ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useGroupStore } from '../../store/group-store'
import { useGearSuggestions, type GearSuggestion } from '../../hooks/useGear'
import { useGroupMembers, useMyGroupRole } from '../../hooks/useGroups'
import { CreateGearSuggestionModal } from './CreateGearSuggestionModal'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { IMPORTANCE_CHIP, STATUS_COLOR } from '../../lib/constants'
import { getAvatarColor } from '../../lib/utils'
import { CardListSkeleton } from '../layout/Skeletons'
import { UserAvatar } from '../ui/heroui-native'
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardPageHeader,
} from '../ui/dashboard'
import { QueryStatePanel } from '../ui/QueryStatePanel'
const importanceOrder = { high: 0, medium: 1, low: 2 } as const
type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  if (color === 'primary' || color === 'secondary') return 'accent'
  return color as NativeChipColor
}

function getActionLabel(actionType: GearSuggestion['action_type']): string {
  switch (actionType) {
    case 'passive_node':
      return 'Passive'
    case 'skill_gem':
      return 'Skill gem'
    case 'support_gem':
      return 'Support gem'
    case 'config_change':
      return 'Config'
    case 'reservation_fix':
      return 'Reservation'
    default:
      return 'Gear'
  }
}

function SuggestionCard({ s, showTarget = false }: { s: GearSuggestion; showTarget?: boolean }) {
  const importanceChip = IMPORTANCE_CHIP[s.importance] ?? IMPORTANCE_CHIP.medium

  return (
    <div className="rounded-medium hover:bg-default-50 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-4">
      {s.item_data?.icon_url ? (
        <img
          src={s.item_data.icon_url}
          alt=""
          className="h-8 w-8 shrink-0 object-contain"
          loading="lazy"
        />
      ) : (
        <UserAvatar
          src={s.target_user.avatar_url ?? undefined}
          name={s.target_user.display_name ?? s.target_user.poe_account_name}
          size="sm"
          style={{ backgroundColor: getAvatarColor(s.target_user.id, s.target_user.avatar_color) }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-foreground min-w-0 text-sm font-medium wrap-anywhere">
            {s.item_name ?? 'Unnamed item'}
          </p>
          <Chip size="sm" variant="soft" color={toNativeChipColor(importanceChip.color)}>
            {importanceChip.label}
          </Chip>
          {s.action_type !== 'gear_item' ? (
            <Chip size="sm" variant="soft" color="accent">
              {getActionLabel(s.action_type)}
            </Chip>
          ) : null}
        </div>
        <p className="text-default-500 mt-1 text-xs wrap-anywhere">
          {showTarget && <>For {s.target_user.display_name ?? s.target_user.poe_account_name} · </>}
          From {s.suggester.display_name ?? s.suggester.poe_account_name}
          {s.notes && <span> · {s.notes}</span>}
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3">
        {s.item_trade_link && (
          <a href={s.item_trade_link} target="_blank" rel="noopener noreferrer" className="button button--sm button--tertiary">
            Trade link
          </a>
        )}
        <Chip size="sm" color={STATUS_COLOR[s.status]} variant="soft" className="capitalize">
          {s.status}
        </Chip>
        <Link
          to="/dashboard/gear/$suggestionId"
          params={{ suggestionId: s.id }}
          className="button button--sm button--tertiary button--icon-only"
          aria-label={s.item_name ? `Open suggestion for ${s.item_name}` : 'Open gear suggestion'}
        >
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

export function GearPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: suggestions, isLoading, isError, refetch } = useGearSuggestions(activeGroupId)
  const { data: members, isLoading: membersLoading } = useGroupMembers(activeGroupId)
  const myRole = useMyGroupRole(activeGroupId)
  const [createOpen, setCreateOpen] = useState(false)
  const { data: currentUser } = useCurrentUser()
  const currentUserId = currentUser?.id ?? null

  const sortedSuggestions = useMemo(() => {
    return [...(suggestions ?? [])].sort((a, b) => {
      const importanceDiff = importanceOrder[a.importance] - importanceOrder[b.importance]
      if (importanceDiff !== 0) return importanceDiff
      return a.created_at < b.created_at ? 1 : -1
    })
  }, [suggestions])

  const forMe = sortedSuggestions.filter((s) => s.target_user_id === currentUserId)
  const forOthers = sortedSuggestions.filter((s) => s.target_user_id !== currentUserId)

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Gear Planning"
        eyebrow="Upgrade queue"
        tone="arcane"
        description="Track suggested upgrades and builds from Analysis."
        actions={
          <>
            <Link to="/dashboard/analysis" className="button button--sm button--tertiary">
              Open Analysis
            </Link>
            {activeGroupId && (myRole === 'admin' || myRole === 'editor') ? (
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                Suggest upgrade
              </Button>
            ) : null}
          </>
        }
      />

      {isLoading ? (
        <CardListSkeleton rows={4} />
      ) : isError && !suggestions ? (
        <QueryStatePanel kind="error" title="Couldn’t load gear suggestions" description="Try again to load the upgrade queue." onRetry={refetch} />
      ) : !suggestions?.length ? (
        <DashboardEmptyState icon={Sword} tone="arcane">
          No gear suggestions yet.
        </DashboardEmptyState>
      ) : (
        <>
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <h2 className="text-foreground text-sm font-semibold">
                Suggestions for you
                {forMe.length > 0 && (
                  <span className="text-default-400 ml-2 font-normal">({forMe.length})</span>
                )}
              </h2>
            </Card.Header>
            <Card.Content className="gap-1 px-2 pt-2 pb-2">
              {forMe.length === 0 ? (
                <p className="text-default-400 px-4 py-3 text-sm">No suggestions for you yet.</p>
              ) : (
                forMe.map((s) => <SuggestionCard key={s.id} s={s} />)
              )}
            </Card.Content>
          </Card>
          {forOthers.length > 0 ? (
            <Card>
              <Card.Header className="px-4 pt-4 pb-0">
                <h2 className="text-foreground text-sm font-semibold">
                  Suggestions for others
                  <span className="text-default-400 ml-2 font-normal">({forOthers.length})</span>
                </h2>
              </Card.Header>
              <Card.Content className="gap-1 px-2 pt-2 pb-2">
                {forOthers.map((s) => (
                  <SuggestionCard key={s.id} s={s} showTarget />
                ))}
              </Card.Content>
            </Card>
          ) : null}
        </>
      )}

      <CreateGearSuggestionModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        members={members}
        membersLoading={membersLoading}
      />
    </DashboardPage>
  )
}
