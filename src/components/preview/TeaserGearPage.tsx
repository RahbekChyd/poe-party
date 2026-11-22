import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { IMPORTANCE_CHIP, STATUS_COLOR } from '../../lib/constants'
import { previewGearSuggestions, previewMembers } from '../../lib/preview-fixtures'
import { getPreviewItemImage } from '../../lib/preview-item-images'
import { UserAvatar } from '../ui/heroui-native'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
import { useGuestGateStore } from '../../store/guest-gate-store'
export function TeaserGearPage() {
  const openGuestGate = useGuestGateStore((state) => state.open)

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        title="Gear"
        description="Explore a sample queue of gear suggestions, priorities, and upgrade statuses."
      />

      <Card className="p-0">
        <Card.Header className="px-4 pb-0 pt-4">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Sample upgrade queue</p>
            </div>
            <Button
              size="sm"
              onPress={() =>
                openGuestGate({
                  title: 'Sign in to suggest an upgrade',
                  description:
                    'Gear planning is only available inside your signed-in workspace.',
                })
              }
            >
              Suggest upgrade
            </Button>
          </div>
        </Card.Header>
        <Card.Content className="gap-1 px-2 pb-2 pt-2">
          {previewGearSuggestions.slice(0, 2).map((suggestion) => {
            const importance = IMPORTANCE_CHIP[suggestion.importance]
            const targetUser = previewMembers.find((member) => member.id === suggestion.target_user_id)
            const suggester = previewMembers.find((member) => member.id === suggestion.suggester_user_id)
            const itemImage = getPreviewItemImage(suggestion.item_name)

            return (
              <div
                key={suggestion.id}
                className="flex flex-col gap-3 rounded-medium px-4 py-3 sm:flex-row sm:items-center"
              >
                {itemImage ? (
                  <img src={itemImage} alt="" className="h-8 w-8 bg-transparent object-contain" />
                ) : (
                  <UserAvatar
                    size="sm"
                    name={targetUser?.display_name ?? 'Member'}
                    style={targetUser ? { backgroundColor: targetUser.avatar_color } : undefined}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium wrap-anywhere text-foreground">
                      {suggestion.item_name}
                    </p>
                    <Chip size="sm" variant="soft">
                      {importance.label}
                    </Chip>
                  </div>
                  <p className="text-xs text-default-400">
                    For {targetUser?.display_name ?? 'the selected member'} - from{' '}
                    {suggester?.display_name ?? 'another member'}
                  </p>
                  <p className="mt-1 text-sm text-default-500">{suggestion.notes}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Chip
                    size="sm"
                    color={STATUS_COLOR[suggestion.status]}
                    variant="soft"
                    className="capitalize"
                  >
                    {suggestion.status}
                  </Chip>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={() =>
                      openGuestGate({
                        title: 'Sign in to view upgrade details',
                        description: 'Connect a PoE account to manage upgrade suggestions in your workspace.',
                      })
                    }
                  >
                    View details
                  </Button>
                </div>
              </div>
            )
          })}
        </Card.Content>
      </Card>

      <UnlockCard
        title="Plan your upgrades"
        description="Sign in to share and track gear suggestions in your workspace."
        points={[
          'Suggest upgrades for yourself or a party member.',
          'Keep item links and notes with each suggestion.',
          'Track open and completed upgrades.',
        ]}
      />
    </div>
  )
}
