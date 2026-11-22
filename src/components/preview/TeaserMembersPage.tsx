import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { getPoePortraitImagePath } from '../../lib/poe-class-art'
import { getAscendancyLabel } from '../../lib/character-profile'
import { previewMembers } from '../../lib/preview-fixtures'
import { ROLE_CHIP } from '../../lib/constants'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
import { AscendancyArt } from '../shared/AscendancyArt'
import { UserAvatar } from '../ui/heroui-native'
const selectedMemberId = previewMembers[0].id

export function TeaserMembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        title="Members"
        description="Explore a sample party roster and the characters assigned to it."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] items-start gap-3">
        {previewMembers.map((member) => {
          const roleChip = ROLE_CHIP[member.role]
          const ascendancy = getAscendancyLabel(member.class, member.ascendancy_class)
          const portraitImagePath = getPoePortraitImagePath(member.class, member.ascendancy_class)
          const isSelected = member.id === selectedMemberId

          return (
            <Card
              key={member.id}
              className={`min-w-0 border p-0 ${
                isSelected ? 'border-highlight bg-selected' : 'border-transparent'
              }`}
            >
              <Card.Content className="gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      size="sm"
                      name={member.display_name}
                      style={{ backgroundColor: member.avatar_color }}
                    />
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-medium wrap-anywhere">
                        {member.display_name}
                      </p>
                      <p className="text-default-400 text-xs wrap-anywhere">
                        {member.character_name} - Level {member.level}
                      </p>
                    </div>
                  </div>

                  {isSelected ? (
                    <Chip size="sm" variant="soft" className="text-highlight">
                      Example
                    </Chip>
                  ) : null}
                </div>

                <AscendancyArt
                  ascendancy={ascendancy}
                  poeClass={member.class}
                  imagePath={portraitImagePath}
                />

                <div className="flex flex-wrap gap-2">
                  <Chip size="sm" variant="soft">
                    {member.snapshot_age_label}
                  </Chip>
                  <Chip size="sm" variant="soft">
                    {roleChip.label}
                  </Chip>
                  {ascendancy ? (
                    <Chip size="sm" variant="soft">
                      {ascendancy}
                    </Chip>
                  ) : null}
                </div>
              </Card.Content>
            </Card>
          )
        })}
      </div>

      <UnlockCard
        title="Manage your party"
        description="Sign in to invite members and sync their shared characters."
        points={[
          'Sync your own characters and keep active builds current.',
          'Share builds publicly or keep them group-only.',
          'Inspect full gear, passive tree, atlas tree, and roster permissions from one page.',
        ]}
      />
    </div>
  )
}
