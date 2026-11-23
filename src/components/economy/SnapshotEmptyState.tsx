import { Card } from '@heroui/react/card'
import { Link } from '@tanstack/react-router'
import { Package } from 'lucide-react'
import covensTalisman from '../../assets/seasonal/covens-talisman.webp'
import { resolveLeagueTheme } from '../../lib/league-theme'
import type { PoeGame } from '../../lib/poe-game'

export function SnapshotTalisman() {
  return (
    <img
      src={covensTalisman}
      alt=""
      width={96}
      height={96}
      loading="lazy"
      className="size-24 object-contain"
    />
  )
}

export function SnapshotEmptyState({
  game,
  league,
  message,
}: {
  game: PoeGame | null
  league: string | null
  message: string
}) {
  const hasTalisman = resolveLeagueTheme(game, league) === 'covens'

  return (
    <Card className="p-0">
      <Card.Content className="flex flex-col items-center gap-3 p-6 text-center sm:p-8">
        {hasTalisman ? <SnapshotTalisman /> : (
          <Package size={28} className="text-default-400" aria-hidden="true" />
        )}
        <p className="text-foreground text-sm font-medium">{message}</p>
        <p className="text-default-500 text-sm">Take a new snapshot to see the current stash.</p>
        <Link to="/dashboard/economy" className="button button--outline min-h-11">
          Go to Economy
        </Link>
      </Card.Content>
    </Card>
  )
}
