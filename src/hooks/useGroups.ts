import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useGroupStore } from '../store/group-store'
import { queryKeys } from '../lib/queryKeys'
import {
  getPoeGameCapabilities,
  getPoeRealm,
  normalizePoeGame,
  type PoeGame,
} from '../lib/poe-game'
export interface Group {
  id: string
  name: string
  game: PoeGame
  league: string
  description: string | null
  invite_code: string
  created_by: string
  created_at: string
  current_strategy_id: string | null
  is_solo: boolean
}

export type GroupRole = 'admin' | 'editor' | 'viewer'

export interface GroupMembership {
  role: GroupRole
  group: Group
}

export interface ActiveGroupContext {
  groupId: string | null
  membership: GroupMembership | null
  role: GroupRole | null
  group: Group | null
  game: PoeGame | null
  league: string | null
  apiRealm: ReturnType<typeof getPoeRealm> | null
  capabilities: ReturnType<typeof getPoeGameCapabilities> | null
  isSolo: boolean
}

function getNextActiveGroupId(
  memberships: GroupMembership[] | undefined,
  removedGroupId: string,
  currentActiveGroupId: string | null,
) {
  if (currentActiveGroupId !== removedGroupId) return currentActiveGroupId
  return memberships?.find((membership) => membership.group.id !== removedGroupId)?.group.id ?? null
}

export function useMyGroups() {
  return useQuery({
    queryKey: [...queryKeys.groups.mine],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('group_members')
        .select(
          `
          role,
          group:groups (
            id, name, game, league, description, invite_code, created_by, created_at, current_strategy_id, is_solo
          )
        `,
        )
        .eq('user_id', user.id)

      if (error) throw error
      return (data as unknown as GroupMembership[]).map((membership) => ({
        ...membership,
        group: {
          ...membership.group,
          game: normalizePoeGame(membership.group.game),
        },
      }))
    },
  })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)

  return useMutation({
    mutationFn: async (values: {
      name: string
      game: PoeGame
      league: string
      description?: string
      is_solo?: boolean
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ ...values, created_by: user.id })
        .select()
        .single()

      if (groupError) throw groupError

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'admin' })

      if (memberError) throw memberError

      return group as Group
    },
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
      setActiveGroupId(group.id)
    },
  })
}

export interface GroupMember {
  role: GroupRole
  joined_at: string
  user: {
    id: string
    poe_account_name: string
    display_name: string | null
    avatar_url: string | null
    avatar_color: string | null
    pob_code: string | null
    pob_support_code: string | null
  }
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.groups.members(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select(
          `
          role,
          joined_at,
          user:users (
            id, poe_account_name, display_name, avatar_url, avatar_color, pob_code, pob_support_code
          )
        `,
        )
        .eq('group_id', groupId!)

      if (error) throw error
      return data as unknown as GroupMember[]
    },
  })
}

export function useUpdatePobCodes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: { pob_code: string | null; pob_support_code: string | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase.from('users').update(values).eq('id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
    },
  })
}

export function useUpdateAvatarColor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, color }: { userId: string; color: string }) => {
      const { error } = await supabase
        .from('users')
        .update({ avatar_color: color })
        .eq('id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.all(null)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.root] })
    },
  })
}

export function useMyGroupRole(groupId: string | null): GroupRole | null {
  const { data: groups } = useMyGroups()
  if (!groupId || !groups) return null
  return groups.find((g) => g.group.id === groupId)?.role ?? null
}

export function useActiveGroupContext(groupId?: string | null): ActiveGroupContext {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const resolvedGroupId = groupId ?? activeGroupId
  const { data: groups } = useMyGroups()

  const membership = resolvedGroupId
    ? groups?.find((groupMembership) => groupMembership.group.id === resolvedGroupId) ?? null
    : null
  const group = membership?.group ?? null
  const game = group?.game ?? null

  return {
    groupId: resolvedGroupId ?? null,
    membership,
    role: membership?.role ?? null,
    group,
    game,
    league: group?.league ?? null,
    apiRealm: game ? getPoeRealm(game) : null,
    capabilities: game ? getPoeGameCapabilities(game) : null,
    isSolo: group?.is_solo ?? false,
  }
}

export function useActiveGroup(): Group | null {
  return useActiveGroupContext().group
}

export function useGroupGame(groupId: string | null): PoeGame | null {
  return useActiveGroupContext(groupId).game
}

export function useIsSoloGroup(groupId: string | null): boolean {
  const { data: groups } = useMyGroups()
  if (!groupId || !groups) return false
  return groups.find((g) => g.group.id === groupId)?.group.is_solo ?? false
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      userId,
      role,
    }: {
      groupId: string
      userId: string
      role: 'editor' | 'viewer'
    }) => {
      const { error } = await supabase
        .from('group_members')
        .update({ role })
        .eq('group_id', groupId)
        .eq('user_id', userId)

      if (error) throw error
    },
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.members(groupId)] })
    },
  })
}

export function useCurrentStrategyId(groupId: string | null): string | null {
  const { data: groups } = useMyGroups()
  if (!groupId || !groups) return null
  return groups.find((g) => g.group.id === groupId)?.group.current_strategy_id ?? null
}

export function useSetCurrentStrategy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ groupId, strategyId }: { groupId: string; strategyId: string | null }) => {
      const { error } = await supabase
        .from('groups')
        .update({ current_strategy_id: strategyId })
        .eq('id', groupId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
    },
  })
}

export function useJoinGroup() {
  const queryClient = useQueryClient()
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      const { data, error } = await supabase.rpc('join_group_by_invite', {
        p_invite_code: inviteCode.trim(),
      })

      if (error) throw error
      return data as string // returns group_id
    },
    onSuccess: (groupId) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
      setActiveGroupId(groupId)
    },
  })
}

export function useLeaveGroup() {
  const queryClient = useQueryClient()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)

  return useMutation({
    mutationFn: async (groupId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id)

      if (error) throw error
    },
    onMutate: (groupId) => {
      // Read cache before invalidation so getNextActiveGroupId sees current memberships
      const memberships = queryClient.getQueryData<GroupMembership[]>(queryKeys.groups.mine)
      return { memberships, groupId }
    },
    onSuccess: (_, groupId, context) => {
      setActiveGroupId(getNextActiveGroupId(context?.memberships, groupId, activeGroupId))
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.members(groupId)] })
    },
  })
}

export function useDeleteGroup() {
  const queryClient = useQueryClient()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)

  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('groups').delete().eq('id', groupId)

      if (error) throw error
    },
    onMutate: (groupId) => {
      const memberships = queryClient.getQueryData<GroupMembership[]>(queryKeys.groups.mine)
      return { memberships, groupId }
    },
    onSuccess: (_, groupId, context) => {
      setActiveGroupId(getNextActiveGroupId(context?.memberships, groupId, activeGroupId))
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.mine] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.groups.members(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.active(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.mine(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.snapshots.latest(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.snapshots.groupHistory(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.snapshots.groupItems(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.economy(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.characterProfiles.group(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.all(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.count(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.all(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })
    },
  })
}
