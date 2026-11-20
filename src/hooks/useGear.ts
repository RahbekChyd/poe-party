import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export type GearStatus = 'open' | 'acknowledged' | 'implemented' | 'dismissed'
export type GearImportance = 'high' | 'medium' | 'low'
export type GearActionType =
  | 'gear_item'
  | 'passive_node'
  | 'skill_gem'
  | 'support_gem'
  | 'config_change'
  | 'reservation_fix'

export interface GearSuggestion {
  id: string
  group_id: string
  target_user_id: string
  suggested_by: string
  item_name: string | null
  item_data: { icon_url: string } | null
  item_trade_link: string | null
  notes: string | null
  importance: GearImportance
  status: GearStatus
  status_note: string | null
  created_at: string
  admin_locked: boolean
  action_type: GearActionType
  action_payload: Record<string, unknown>
  source_recommendation_plan_id: string | null
  target_user: {
    id: string
    display_name: string | null
    poe_account_name: string
    avatar_url: string | null
    avatar_color: string | null
  }
  suggester: {
    id: string
    display_name: string | null
    poe_account_name: string
    avatar_url: string | null
    avatar_color: string | null
  }
}

export function useGearSuggestions(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.gear.all(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gear_suggestions')
        .select(
          `
          id, group_id, target_user_id, suggested_by,
          item_name, item_data, item_trade_link, notes, importance, status, status_note, created_at, admin_locked,
          action_type, action_payload, source_recommendation_plan_id,
          target_user:users!gear_suggestions_target_user_id_fkey(id, display_name, poe_account_name, avatar_url, avatar_color),
          suggester:users!gear_suggestions_suggested_by_fkey(id, display_name, poe_account_name, avatar_url, avatar_color)
        `,
        )
        .eq('group_id', groupId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as unknown as GearSuggestion[]
    },
  })
}

export function useGearSuggestion(suggestionId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.gear.single(suggestionId!)],
    enabled: !!suggestionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gear_suggestions')
        .select(
          `
          id, group_id, target_user_id, suggested_by,
          item_name, item_data, item_trade_link, notes, importance, status, status_note, created_at, admin_locked,
          action_type, action_payload, source_recommendation_plan_id,
          target_user:users!gear_suggestions_target_user_id_fkey(id, display_name, poe_account_name, avatar_url, avatar_color),
          suggester:users!gear_suggestions_suggested_by_fkey(id, display_name, poe_account_name, avatar_url, avatar_color)
        `,
        )
        .eq('id', suggestionId!)
        .maybeSingle()

      if (error) throw error
      return data as unknown as GearSuggestion | null
    },
  })
}

export function useCreateGearSuggestion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      group_id: string
      target_user_id: string
      item_name?: string
      item_data?: { icon_url: string } | null
      item_trade_link?: string
      notes?: string
      importance?: GearImportance
      action_type?: GearActionType
      action_payload?: Record<string, unknown>
      source_recommendation_plan_id?: string | null
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('gear_suggestions')
        .insert({ ...values, suggested_by: user.id, status: 'open' })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.all(data.group_id)] })
    },
  })
}

export function useUpdateGearSuggestion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      id: string
      group_id: string
      item_name?: string | null
      item_data?: { icon_url: string } | null
      item_trade_link?: string | null
      notes?: string | null
      importance?: GearImportance
      status?: GearStatus
      status_note?: string | null
      admin_locked?: boolean
      action_type?: GearActionType
      action_payload?: Record<string, unknown>
      source_recommendation_plan_id?: string | null
    }) => {
      const { id, group_id, ...fields } = values
      void group_id
      const { data, error } = await supabase
        .from('gear_suggestions')
        .update(fields)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.single(data.id)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.all(data.group_id)] })
    },
  })
}

export function useDeleteGearSuggestion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: { id: string; group_id: string }) => {
      const { data, error } = await supabase
        .from('gear_suggestions')
        .delete()
        .eq('id', values.id)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Gear suggestion was not deleted')
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.single(variables.id)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.all(variables.group_id)] })
    },
  })
}
