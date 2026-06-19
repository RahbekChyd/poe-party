import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ArrowRight } from 'lucide-react'
import { getAscendancyLabel } from '../../lib/character-profile'
import { getPoePortraitImagePath } from '../../lib/poe-class-art'
import { getPoeGameShortLabel, type PoeGame } from '../../lib/poe-game'
import { AscendancyArt } from '../shared/AscendancyArt'

export interface DirectoryCharacterResult {
  profile_id: string
  group_id: string
  group_name: string
  group_game: PoeGame | null
  owner_name: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
  league: string | null
}

export interface DirectoryGroupCharacterResult {
  profile_id: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
  owner_name: string
}

export interface DirectoryGroupResult {
  group_id: string
  group_name: string
  game: PoeGame | null
  league: string
  public_character_count: number
  characters: DirectoryGroupCharacterResult[]
}

function getCharacterClassLine(character: { class: string | null; level: number | null }): string {
  if (!character.class) return 'Public character'
  return `${character.class}${character.level != null ? ` - Level ${character.level}` : ''}`
}

function getCharacterPresentation({
  className,
  ascendancyClass,
  game,
}: {
  className: string | null
  ascendancyClass: number | null
  game: PoeGame
}) {
  const ascendancy = getAscendancyLabel(className, ascendancyClass, game)

  return {
    ascendancy,
    imagePath: getPoePortraitImagePath(className, ascendancyClass, game),
  }
}

export function DirectoryCharacterCardContent({
  character,
  fallbackGame,
  actionLabel = 'Open',
  detailChipLabel,
  statusLabel,
}: {
  character: DirectoryCharacterResult
  fallbackGame?: PoeGame | null
  actionLabel?: string
  detailChipLabel?: string | null
  statusLabel?: string
}) {
  const game = character.group_game ?? fallbackGame ?? 'poe1'
  const { ascendancy, imagePath } = getCharacterPresentation({
    className: character.class,
    ascendancyClass: character.ascendancy_class,
    game,
  })

  return (
    <Card.Content className="flex h-full flex-col gap-3 p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-semibold">
            {character.character_name}
          </p>
          <p className="text-default-500 mt-1 truncate text-xs">
            Public by {character.owner_name}
            {character.league ? ` - ${character.league}` : ''}
          </p>
        </div>
        {statusLabel ? (
          <Chip className="shrink-0" size="sm" color="accent" variant="soft">
            {statusLabel}
          </Chip>
        ) : null}
      </div>

      <AscendancyArt
        ascendancy={ascendancy}
        poeClass={character.class}
        imagePath={imagePath}
        heightClass="h-24"
      />

      <div className="flex flex-wrap gap-1.5">
        {character.class ? (
          <Chip size="sm" variant="soft">
            {character.class}
            {character.level != null ? ` ${character.level}` : ''}
          </Chip>
        ) : null}
        {ascendancy ? (
          <Chip size="sm" variant="soft">
            {ascendancy}
          </Chip>
        ) : null}
        <Chip size="sm" variant="soft">
          {getPoeGameShortLabel(game)}
        </Chip>
      </div>

      <div className="border-divider/70 mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <div className="min-w-0 flex-1">
          <p className="text-default-600 truncate text-xs font-medium">
            {getCharacterClassLine(character)}
          </p>
          <p className="text-default-400 mt-1 truncate text-xs">From {character.group_name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {detailChipLabel ? (
            <Chip size="sm" variant="soft">
              {detailChipLabel}
            </Chip>
          ) : null}
          <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
            {actionLabel}
            <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Card.Content>
  )
}

export function DirectoryGroupCardContent({
  group,
  fallbackGame,
  actionLabel = 'Open',
  detailChipLabel,
  statusLabel,
}: {
  group: DirectoryGroupResult
  fallbackGame?: PoeGame | null
  actionLabel?: string
  detailChipLabel?: string | null
  statusLabel?: string
}) {
  const game = group.game ?? fallbackGame ?? 'poe1'
  const visibleCharacters = group.characters.slice(0, 3)
  const hiddenCharacterCount = Math.max(0, group.characters.length - visibleCharacters.length)

  return (
    <Card.Content className="flex h-full flex-col gap-3 p-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-semibold">{group.group_name}</p>
          <p className="text-default-500 mt-1 truncate text-xs">
            {group.public_character_count} public character
            {group.public_character_count === 1 ? '' : 's'} - {group.league}
          </p>
        </div>
        {statusLabel ? (
          <Chip className="shrink-0" size="sm" color="accent" variant="soft">
            {statusLabel}
          </Chip>
        ) : null}
      </div>

      {visibleCharacters.length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {visibleCharacters.map((character) => {
            const { ascendancy, imagePath } = getCharacterPresentation({
              className: character.class,
              ascendancyClass: character.ascendancy_class,
              game,
            })

            return (
              <div key={character.profile_id} className="w-28 shrink-0">
                <AscendancyArt
                  ascendancy={ascendancy}
                  poeClass={character.class}
                  imagePath={imagePath}
                  heightClass="h-20"
                />
                <div className="mt-1.5 min-w-0">
                  <p className="text-foreground truncate text-xs font-semibold">
                    {character.character_name}
                  </p>
                  <p className="text-default-500 mt-0.5 truncate text-xs">
                    {getCharacterClassLine(character)}
                  </p>
                </div>
              </div>
            )
          })}
          {hiddenCharacterCount > 0 ? (
            <div className="bg-default-100/70 border-divider/70 flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border text-center">
              <p className="text-foreground text-sm font-semibold">+{hiddenCharacterCount}</p>
              <p className="text-default-500 text-xs">more</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="bg-default-50 text-default-500 rounded-lg px-3 py-6 text-center text-sm">
          No public character preview available.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Chip size="sm" variant="soft">
          {getPoeGameShortLabel(game)}
        </Chip>
        <Chip size="sm" variant="soft">
          {group.public_character_count} public
        </Chip>
      </div>

      <div className="border-divider/70 mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <p className="text-default-500 min-w-0 flex-1 truncate text-xs">
          {visibleCharacters.length > 0
            ? visibleCharacters.map((character) => character.character_name).join(', ')
            : 'Public group'}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {detailChipLabel ? (
            <Chip size="sm" variant="soft">
              {detailChipLabel}
            </Chip>
          ) : null}
          <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
            {actionLabel}
            <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Card.Content>
  )
}
