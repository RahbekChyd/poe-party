import { Avatar } from '@heroui/react/avatar'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { IMPORTANCE_CHIP, STATUS_COLOR } from '../../lib/constants'
import { previewGearSuggestions, previewMembers } from '../../lib/preview-fixtures'
import { getPreviewItemImage } from '../../lib/preview-item-images'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
import { useGuestGateStore } from '../../store/guest-gate-store'
export function TeaserGearPage() {
  const openGuestGate = useGuestGateStore((state) => state.open)

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="teaser"
        title="Gear"
        description="A lighter sample of the upgrade planning queue. The entries here are illustrative, but the layout mirrors how real suggestions are surfaced after sign-in."
      />

      <Card>
        <Card.Header className="px-4 pb-0 pt-4">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Illustrative suggestion queue</p>
              <p className="mt-1 text-sm text-default-500">
                Keep ownership, status, and trade intent visible without turning the preview into a full fake workspace.
              </p>
            </div>
            <Button
              variant="tertiary"
              onPress={() =>
                openGuestGate({
                  title: 'Sign in to add real upgrade suggestions',
                  description:
                    'Gear planning is only available inside your signed-in workspace.',
                })
              }
            >
              Suggest Upgrade
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
                  <Avatar
                    size="sm"
                    style={{ backgroundColor: targetUser?.avatar_color ?? '#f5a524' }}
                  >
                    <Avatar.Fallback className="font-semibold text-white">
                      {(targetUser?.display_name ?? 'Member').slice(0, 2).toUpperCase()}
                    </Avatar.Fallback>
                  </Avatar>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {suggestion.item_name}
                    </p>
                    <Chip size="sm" variant="soft" color={importance.color}>
                      {importance.label}
                    </Chip>
                  </div>
                  <p className="text-xs text-default-400">
                    For {targetUser?.display_name ?? 'the selected member'} - from{' '}
                    {suggester?.display_name ?? 'another member'}
                  </p>
                  <p className="mt-1 text-sm text-default-500">{suggestion.notes}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                        title: 'Sign in to inspect upgrade details',
                        description:
                          'Detailed gear planning lives inside your signed-in workspace, where you can track status, ownership, and real item links.',
                      })
                    }
                  >
                    Open
                  </Button>
                </div>
              </div>
            )
          })}
        </Card.Content>
      </Card>

      <UnlockCard
        title="What gear planning unlocks after sign-in"
        description="The real gear page becomes a working queue for your upgrades and handoffs."
        points={[
          'Create and manage real upgrade suggestions.',
          'Open full suggestion details, status notes, and item links.',
          'Track which upgrades are still open and which ones are already handled.',
        ]}
      />
    </div>
  )
}
