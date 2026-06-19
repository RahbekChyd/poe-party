import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Sword, ArrowRight, Sparkles } from 'lucide-react'
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
  DashboardNotice,
  DashboardPage,
  DashboardPageHeader,
} from '../ui/dashboard'
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
    <div className="rounded-medium hover:bg-default-50 flex items-center gap-3 px-4 py-3">
      {s.item_data?.icon_url ? (
        <img src={s.item_data.icon_url} className="h-8 w-8 object-contain" loading="lazy" />
      ) : (
        <UserAvatar
          src={s.target_user.avatar_url ?? undefined}
          name={s.target_user.display_name ?? s.target_user.poe_account_name}
          size="sm"
          style={{ backgroundColor: getAvatarColor(s.target_user.id, s.target_user.avatar_color) }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-foreground truncate text-sm font-medium">
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
        <p className="text-default-400 text-xs">
          {showTarget && <>For {s.target_user.display_name ?? s.target_user.poe_account_name} · </>}
          From {s.suggester.display_name ?? s.suggester.poe_account_name}
          {s.notes && <span> · {s.notes}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {s.item_trade_link && (
          <a href={s.item_trade_link} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="tertiary" type="button">
              Trade link
            </Button>
          </a>
        )}
        <Chip size="sm" color={STATUS_COLOR[s.status]} variant="soft" className="capitalize">
          {s.status}
        </Chip>
        <Link to="/dashboard/gear/$suggestionId" params={{ suggestionId: s.id }}>
          <Button isIconOnly size="sm" variant="tertiary">
            <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </div>
  )
}

export function GearPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: suggestions, isLoading } = useGearSuggestions(activeGroupId)
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
        description="Collaborative upgrade queue for accepted analysis output and manual suggestions."
        actions={
          <>
            <Link to="/dashboard/analysis">
              <Button size="sm" variant="tertiary">
                Open Analysis
              </Button>
            </Link>
            {activeGroupId && myRole !== 'viewer' ? (
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                Suggest Upgrade
              </Button>
            ) : null}
          </>
        }
      />

      <DashboardNotice icon={Sparkles} title="Analysis handoff" tone="warning">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p>
              Run PoB analysis, choose the target build setup, and review future build planning in
              Analysis, then push accepted upgrades back into this gear queue.
            </p>
          </div>
          <Link to="/dashboard/analysis" className="shrink-0">
            <Button size="sm">Go to Analysis</Button>
          </Link>
        </div>
      </DashboardNotice>

      {isLoading ? (
        <CardListSkeleton rows={4} />
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
