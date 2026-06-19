import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export interface SnapshotItem {
  id: string
  name: string
  type_line: string
  base_type: string | null
  frame_type: number
  ilvl: number
  icon_url: string | null
  stack_size: number
  tab_name: string
  tab_type: string
  colour_r: number | null
  colour_g: number | null
  colour_b: number | null
  price_chaos: number | null
  is_excluded: boolean
  excluded_reason: string | null
}

export interface GroupSnapshotItem extends SnapshotItem {
  user_id: string
}

// ── Shared mapper ─────────────────────────────────────────────────────────────

interface TabInfo {
  name: string
  tab_type: string
  colour_r: number | null
  colour_g: number | null
  colour_b: number | null
}

interface RawItem {
  id: unknown
  name: unknown
  type_line: unknown
  base_type: unknown
  frame_type: unknown
  ilvl: unknown
  icon_url: unknown
  stack_size: unknown
  tab_name?: unknown
  tab_type?: unknown
  colour_r?: unknown
  colour_g?: unknown
  colour_b?: unknown
  price_chaos?: unknown
  is_excluded?: unknown
  excluded_reason?: unknown
  user_id?: unknown
  tab_id?: unknown
}

function toSnapshotItem(raw: RawItem, tab?: TabInfo): SnapshotItem {
  return {
    id: raw.id as string,
    name: (raw.name as string) ?? '',
    type_line: (raw.type_line as string) ?? '',
    base_type: (raw.base_type as string | null) ?? null,
    frame_type: (raw.frame_type as number) ?? 0,
    ilvl: (raw.ilvl as number) ?? 0,
    icon_url: (raw.icon_url as string | null) ?? null,
    stack_size: (raw.stack_size as number) ?? 1,
    tab_name: tab?.name ?? (raw.tab_name as string) ?? '?',
    tab_type: tab?.tab_type ?? (raw.tab_type as string) ?? '',
    colour_r: tab?.colour_r ?? (raw.colour_r as number | null) ?? null,
    colour_g: tab?.colour_g ?? (raw.colour_g as number | null) ?? null,
    colour_b: tab?.colour_b ?? (raw.colour_b as number | null) ?? null,
    price_chaos: (raw.price_chaos as number | null) ?? null,
    is_excluded: (raw.is_excluded as boolean) ?? false,
    excluded_reason: (raw.excluded_reason as string | null) ?? null,
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useGroupSnapshotItems(groupId: string | null) {
  return useQuery({
    queryKey: queryKeys.snapshots.groupItems(groupId),
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('latest_stash_items')
        .select(
          'id, name, type_line, base_type, frame_type, ilvl, icon_url, stack_size, user_id, tab_name, tab_type, colour_r, colour_g, colour_b',
        )
        .eq('group_id', groupId!)

      if (error) throw error

      return (data ?? []).map((item) => ({
        ...toSnapshotItem(item as RawItem),
        user_id: item.user_id as string,
      })) as GroupSnapshotItem[]
    },
  })
}

/**
 * Fetches items for a specific user in a group.
 *
 * - When `snapshotId` is omitted or null: queries `latest_stash_items` (the
 *   most recent completed snapshot for that user/group).
 * - When `snapshotId` is provided: fetches items for that specific historical
 *   snapshot via a two-step tabs → items query.
 */
export function useSnapshotItems(
  groupId: string | null,
  userId: string | null,
  snapshotId?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.snapshots.items(groupId, userId, snapshotId),
    enabled: !!groupId && !!userId,
    queryFn: async () => {
      if (snapshotId) {
        // Historical snapshot: resolve tabs first, then fetch items by tab IDs
        const { data: tabs, error: tabsError } = await supabase
          .from('stash_tabs')
          .select('id, name, tab_type, colour_r, colour_g, colour_b')
          .eq('snapshot_id', snapshotId)
          .eq('user_id', userId!)

        if (tabsError) throw tabsError

        const tabMap = new Map(
          (tabs ?? []).map((t) => [
            t.id as string,
            {
              name: t.name as string,
              tab_type: t.tab_type as string,
              colour_r: t.colour_r as number | null,
              colour_g: t.colour_g as number | null,
              colour_b: t.colour_b as number | null,
            },
          ]),
        )

        if (tabMap.size === 0) return []

        const { data: items, error: itemsError } = await supabase
          .from('stash_items')
          .select(
            'id, tab_id, name, type_line, base_type, frame_type, ilvl, icon_url, stack_size, price_chaos, is_excluded, excluded_reason',
          )
          .in('tab_id', [...tabMap.keys()])
          .eq('user_id', userId!)

        if (itemsError) throw itemsError

        return (items ?? []).map((item) => {
          const tab = tabMap.get(item.tab_id as string)
          return toSnapshotItem(item as RawItem, tab)
        })
      }

      // Latest snapshot: use the view
      const { data, error } = await supabase
        .from('latest_stash_items')
        .select(
          'id, name, type_line, base_type, frame_type, ilvl, icon_url, stack_size, tab_name, tab_type, colour_r, colour_g, colour_b, price_chaos, is_excluded, excluded_reason',
        )
        .eq('group_id', groupId!)
        .eq('user_id', userId!)

      if (error) throw error

      return (data ?? []).map((item) => toSnapshotItem(item as RawItem))
    },
  })
}

export function useSetSnapshotItemExcluded(
  groupId: string | null,
  userId: string | null,
  snapshotId?: string | null,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      itemId,
      isExcluded,
      reason,
    }: {
      itemId: string
      isExcluded: boolean
      reason?: string | null
    }) => {
      const { error } = await supabase.rpc('set_snapshot_item_excluded', {
        p_item_id: itemId,
        p_is_excluded: isExcluded,
        p_reason: reason ?? null,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapshots.items(groupId, userId, snapshotId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.items(groupId, userId, null) })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.history(groupId, userId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.groupHistory(groupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.economy(groupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.groupItems(groupId) })
    },
  })
}

export function useSetSnapshotItemExcludedAllHistory(
  groupId: string | null,
  userId: string | null,
  snapshotId?: string | null,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      itemId,
      isExcluded,
      reason,
    }: {
      itemId: string
      isExcluded: boolean
      reason?: string | null
    }) => {
      const { error } = await supabase.rpc('set_snapshot_item_excluded_all_history', {
        p_item_id: itemId,
        p_is_excluded: isExcluded,
        p_reason: reason ?? null,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapshots.items(groupId, userId, snapshotId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.items(groupId, userId, null) })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.history(groupId, userId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.groupHistory(groupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.economy(groupId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.groupItems(groupId) })
    },
  })
}
