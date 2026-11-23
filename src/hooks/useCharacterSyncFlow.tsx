import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
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
  const { data: profile } = useMyProfile()
  const queryClient = useQueryClient()
  const [isBusy, setIsBusy] = useState(false)
  const hasOAuthAccess = !!profile?.poe_token_expires_at
  const canSync = hasOAuthAccess

  const triggerSync = async (nextGroupId: string) => {
    if (isBusy || !nextGroupId) return
    setIsBusy(true)
    try {
      const targetGame = nextGroupId === resolvedGroupId && game ? game : await getGroupGame(nextGroupId)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      if (!hasOAuthAccess) {
        throw new Error('Character sync requires PoE OAuth access.')
      }

      const { error } = await supabase.functions.invoke('poe-sync-characters', {
        body: {
          group_id: nextGroupId,
          user_id: user.id,
        },
      })

      if (error) throw error
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.mineGroup(nextGroupId) })
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
