import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export interface MyCharacter {
  id: string
  name: string
  class: string
  level: number
  is_active: boolean
}

export function useMyCharacters(groupId: string | null, league?: string | null) {
  return useQuery({
    queryKey: [...queryKeys.characters.mine(groupId, league)],
    enabled: !!groupId,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let query = supabase
        .from('characters')
        .select('id, name, class, level, is_active')
        .eq('group_id', groupId!)
        .eq('user_id', user.id)
        .order('level', { ascending: false })

      if (league) {
        query = query.eq('league', league)
      }

      const { data, error } = await query
      if (error) throw error
      return data as MyCharacter[]
    },
  })
}

export function useSetActiveCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ characterId, groupId }: { characterId: string; groupId: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: deactivateError } = await supabase
        .from('characters')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('group_id', groupId)
        .neq('id', characterId)
        .eq('is_active', true)

      if (deactivateError) throw deactivateError

      const { data, error } = await supabase
        .from('characters')
        .update({ is_active: true })
        .eq('id', characterId)
        .eq('user_id', user.id)
        .eq('group_id', groupId)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Character is unavailable in this workspace')
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.mineGroup(variables.groupId) })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.active(variables.groupId)] })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characterProfiles.group(variables.groupId)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.root],
      })
    },
  })
}
