import { useMemo } from 'react'
import { useMyProfile } from './useCurrentUser'
import { canUsePoe2FromAccountName, getAvailablePoeGameOptions } from '../lib/poe-game'
export function usePoeGameAccess() {
  const { data: profile } = useMyProfile()

  return useMemo(() => {
    const poeAccountName = profile?.poe_account_name ?? null
    const canUsePoe2 = canUsePoe2FromAccountName(poeAccountName)

    return {
      canUsePoe2,
      availableGames: getAvailablePoeGameOptions(poeAccountName),
    }
  }, [profile?.poe_account_name])
}
