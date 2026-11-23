import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export function useCurrentUser() {
  return useQuery({
    queryKey: [...queryKeys.currentUser],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useMyProfile() {
  const { data: user } = useCurrentUser()

  return useQuery({
    queryKey: [...queryKeys.myProfile(user?.id)],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select(
          'display_name, poe_account_name, avatar_url, avatar_color, subscription_tier, subscription_expires_at, poe_token_expires_at, has_seen_early_access_notice',
        )
        .eq('id', user!.id)
        .single()

      if (error) throw error
      return data
    },
  })
}

export function useMarkEarlyAccessNoticeSeen() {
  const queryClient = useQueryClient()
  const { data: user } = useCurrentUser()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('users')
        .update({ has_seen_early_access_notice: true })
        .eq('id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.myProfile(user?.id)] })
    },
  })
}
