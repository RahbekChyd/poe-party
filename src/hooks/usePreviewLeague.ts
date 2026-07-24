import { useEffect } from 'react'
import { usePoeLeagues } from './usePoeLeagues'
import { usePreviewStore } from '../store/preview-store'
import type { PoeGame } from '../lib/poe-game'
export function usePreviewLeague(canUsePoe2 = false) {
  const selectedGame = usePreviewStore((state) => state.selectedGame)
  const setSelectedGame = usePreviewStore((state) => state.setSelectedGame)
  const effectiveGame: PoeGame = canUsePoe2 && selectedGame === 'poe2' ? 'poe2' : 'poe1'
  const {
    data: leagues = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = usePoeLeagues(effectiveGame)
  const selectedLeague = usePreviewStore((state) => state.selectedLeague)
  const setSelectedLeague = usePreviewStore((state) => state.setSelectedLeague)

  useEffect(() => {
    if (selectedGame === effectiveGame) return
    setSelectedGame(effectiveGame)
  }, [effectiveGame, selectedGame, setSelectedGame])

  useEffect(() => {
    if (!leagues.length) return

    if (selectedLeague && leagues.some((league) => league.id === selectedLeague)) {
      return
    }

    const preferredLeague = leagues.find((league) => league.group === 'current') ?? leagues[0]
    setSelectedLeague(preferredLeague.id)
  }, [leagues, selectedLeague, setSelectedLeague])

  return {
    selectedGame: effectiveGame,
    setSelectedGame,
    leagues,
    selectedLeague:
      selectedLeague && leagues.some((league) => league.id === selectedLeague)
        ? selectedLeague
        : (leagues.find((league) => league.group === 'current') ?? leagues[0])?.id ?? null,
    setSelectedLeague,
    isLoading,
    isError,
    isFetching,
    refetch,
  }
}
