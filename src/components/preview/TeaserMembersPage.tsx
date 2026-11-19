import { Avatar } from '@heroui/react/avatar'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { getPoePortraitImagePath } from '../../lib/poe-class-art'
import { getAscendancyLabel } from '../../lib/character-profile'
import { previewMembers } from '../../lib/preview-fixtures'
import { ROLE_CHIP } from '../../lib/constants'
import { PreviewPageIntro, UnlockCard } from './PreviewShared'
import { AscendancyArt } from '../shared/AscendancyArt'
const selectedMemberId = previewMembers[0].id

export function TeaserMembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="teaser"
        title="Members"
        description="Explore a sample party roster and the characters assigned to it."
      />

      <div className="-mx-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3 px-1">
          {previewMembers.map((member) => {
            const roleChip = ROLE_CHIP[member.role]
            const ascendancy = getAscendancyLabel(member.class, member.ascendancy_class)
            const portraitImagePath = getPoePortraitImagePath(member.class, member.ascendancy_class)
            const isSelected = member.id === selectedMemberId

            return (
              <Card
                key={member.id}
                className={`w-[18.5rem] shrink-0 border transition-all ${
                  isSelected
                    ? 'border-warning/50 bg-warning/5-lg-warning/10'
                    : 'border-transparent'
                }`}
              >
                <Card.Content className="gap-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        size="sm"
                        style={{ backgroundColor: member.avatar_color }}
                      >
                        <Avatar.Fallback className="font-semibold text-white">
                          {member.display_name.slice(0, 2).toUpperCase()}
                        </Avatar.Fallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {member.display_name}
                        </p>
                        <p className="truncate text-xs text-default-400">
                          {member.character_name} - Level {member.level}
                        </p>
                      </div>
                    </div>

                    {isSelected ? (
                      <Chip size="sm" color="warning" variant="soft">
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
                    <Chip size="sm" color={roleChip.color === 'primary' ? 'accent' : roleChip.color} variant="soft">
                      {roleChip.label}
                    </Chip>
                    {ascendancy ? (
                      <Chip size="sm" variant="soft">
                        {ascendancy}
                      </Chip>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-default-500">
                      {member.class} - Level {member.level}
                    </p>
                    <div className="flex items-center gap-1.5 text-default-400">
                      <Chip size="sm" variant="soft">
                        Gear
                      </Chip>
                      <Chip size="sm" variant="soft">
                        Tree
                      </Chip>
                    </div>
                  </div>
                </Card.Content>
              </Card>
            )
          })}
        </div>
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
