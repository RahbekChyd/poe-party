import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PoeLeagueOption } from '../../hooks/usePoeLeagues'
import { getPoeGameShortLabel, isPoeGame, type PoeGame } from '../../lib/poe-game'
import { ListBox, SelectField } from '../ui/heroui-native'

export function FilterDisclosure({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: ReactNode
}) {
  return (
    <details className="group min-w-0">
      <summary className="border-divider hover:bg-default-50 focus-visible:outline-primary flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 wrap-anywhere">
          <span className="text-default-500">{label}</span>{' '}
          <span className="text-foreground font-medium">{value}</span>
        </span>
        <ChevronDown aria-hidden="true" size={15} className="shrink-0 group-open:rotate-180" />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  )
}

export function DiscoveryScope({
  game,
  league,
  games,
  leagues,
  onGameChange,
  onLeagueChange,
}: {
  game: PoeGame
  league: string | null
  games: readonly { id: PoeGame; label: string }[]
  leagues: readonly PoeLeagueOption[]
  onGameChange: (game: PoeGame) => void
  onLeagueChange: (league: string | null) => void
}) {
  const leagueLabel = leagues.find((option) => option.id === league)?.label

  return (
    <FilterDisclosure label="Game and league" value={[getPoeGameShortLabel(game), leagueLabel].filter(Boolean).join(' · ')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Game"
          selectedKey={game}
          onSelectionChange={(value) => {
            if (isPoeGame(value)) onGameChange(value)
          }}
        >
          {games.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
            </ListBox.Item>
          ))}
        </SelectField>
        <SelectField
          label="League"
          selectedKey={league}
          isDisabled={leagues.length === 0}
          onSelectionChange={(value) => onLeagueChange(typeof value === 'string' ? value : null)}
        >
          {leagues.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
            </ListBox.Item>
          ))}
        </SelectField>
      </div>
    </FilterDisclosure>
  )
}
