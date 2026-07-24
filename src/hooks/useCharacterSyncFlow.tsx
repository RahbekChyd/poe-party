import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { usePoeSession } from '../store/poe-session-store'
import { usePoeSnapshot } from './usePoeSnapshot'
import { useMyProfile } from './useCurrentUser'
import { normalizePoeGame, type PoeGame } from '../lib/poe-game'
import { useActiveGroupContext } from './useGroups'
import { useGroupStore } from '../store/group-store'
import { trackProductEvent } from '../lib/analytics'
async function getGroupGame(groupId: string): Promise<PoeGame> {
  const { data, error } = await supabase
    .from('groups')
    .select('game')
    .eq('id', groupId)
    .single()

  if (error) throw error
  return normalizePoeGame(data?.game)
}

export function useCharacterSyncFlow(groupId?: string | null) {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const resolvedGroupId = groupId ?? activeGroupId
  const { game } = useActiveGroupContext(resolvedGroupId)
  const { sessId } = usePoeSession()
  const { snapshotCharacters } = usePoeSnapshot()
  const { data: profile } = useMyProfile()
  const queryClient = useQueryClient()
  const [isBusy, setIsBusy] = useState(false)
  const hasOAuthAccess = !!profile?.poe_token_expires_at
  const supportsCookieAuth = (game ?? 'poe1') === 'poe1'
  const canSync = hasOAuthAccess || (!!sessId && supportsCookieAuth)

  const triggerSync = async (nextGroupId: string) => {
    if (isBusy || !nextGroupId) return
    setIsBusy(true)
    try {
      const targetGame = nextGroupId === resolvedGroupId && game ? game : await getGroupGame(nextGroupId)

      if (sessId && targetGame === 'poe1') {
        await snapshotCharacters(nextGroupId)
        trackProductEvent('activation_character_sync_completed', {
          game: targetGame,
          transport: 'local_cookie',
        })
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      if (!hasOAuthAccess) {
        throw new Error(
          targetGame === 'poe2'
            ? 'Path of Exile 2 character sync currently requires OAuth access.'
            : 'Character sync requires either OAuth access or a valid PoE session.',
        )
      }

      const { error } = await supabase.functions.invoke('poe-sync-characters', {
        body: {
          group_id: nextGroupId,
          user_id: user.id,
        },
      })

      if (error) throw error
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.mine(nextGroupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.active(nextGroupId)] })
      trackProductEvent('activation_character_sync_completed', {
        game: targetGame,
        transport: 'oauth',
      })
    } finally {
      setIsBusy(false)
    }
  }

  return { triggerSync, isBusy, canSync }
}
