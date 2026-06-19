import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchPoeCharacters, fetchPoeStashTabItems } from '../lib/poe-cookie-client'
import type { LegacyStashTab } from '../lib/poe-cookie-client'
import { fetchAllNinjaPrices } from '../lib/poe-ninja-client'
import type { PoeItem } from '../types/poe-api'
import { usePoeSession } from '../store/poe-session-store'
import { useSnapshotStore } from '../store/snapshot-store'
import { queryKeys } from '../lib/queryKeys'
import { normalizeCharacterClassInfo } from '../lib/poe-character-class'
// With max 5 tabs, parallel fetches stay well under PoE's rate limit

export function usePoeSnapshot() {
  const { sessId, cfClearance, accountName } = usePoeSession()
  const queryClient = useQueryClient()
  const { setProgress, reset } = useSnapshotStore()

  // ── Characters ────────────────────────────────────────────────────────────

  const snapshotCharacters = async (groupId: string) => {
    reset()
    setProgress({ phase: 'characters', message: 'Fetching characters from PoE…' })

    const poeChars = await fetchPoeCharacters(accountName, sessId, cfClearance)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const upserts = poeChars.map((c) => ({
      user_id: user.id,
      group_id: groupId,
      // The legacy /character-window endpoint has no `id` field — use name as stable identifier
      poe_character_id: c.id ?? c.name,
      name: c.name,
      league: c.league,
      class: normalizeCharacterClassInfo('poe1', c.class, c.ascendancyClass ?? 0).className,
      ascendancy_class: normalizeCharacterClassInfo('poe1', c.class, c.ascendancyClass ?? 0).ascendancyClass,
      level: c.level,
      experience: c.experience ?? 0,
      is_active: c.current ?? false,
      raw_data: c,
      snapshotted_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('characters')
      .upsert(upserts, { onConflict: 'user_id,group_id,poe_character_id' })

    if (error) {
      setProgress({ phase: 'error', message: error.message })
      throw error
    }

    setProgress({ phase: 'done', message: `Synced ${poeChars.length} characters` })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.mine(groupId)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.active(groupId)] })
  }

  // ── Stash ─────────────────────────────────────────────────────────────────

  /**
   * @param selectedTabs  The already-fetched and user-confirmed tab list to snapshot.
   *                      Caller (useSyncFlow) fetches tabs once for the selector UI and passes
   *                      the filtered result here — avoiding a redundant API call.
   * @param league        Needed to fetch items per tab (the items endpoint requires it).
   */
  const snapshotStash = async (groupId: string, league: string, selectedTabs: LegacyStashTab[]) => {
    reset()
    setProgress({
      phase: 'stash',
      message: 'Starting stash snapshot…',
      tabsCurrent: 0,
      tabsTotal: selectedTabs.length,
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Clean up any stuck in_progress records for this user before inserting,
    // so we never hit the unique constraint (stash_snapshots_one_active_per_user).
    await supabase
      .from('stash_snapshots')
      .update({ status: 'failed', error_msg: 'Superseded by new snapshot' })
      .eq('user_id', user.id)
      .in('status', ['pending', 'in_progress'])

    // Look up the group's current strategy to auto-tag the snapshot
    const { data: group } = await supabase
      .from('groups')
      .select('current_strategy_id')
      .eq('id', groupId)
      .single()

    // Create snapshot record
    const { data: snapshot, error: snapshotError } = await supabase
      .from('stash_snapshots')
      .insert({
        user_id: user.id,
        group_id: groupId,
        strategy_id: group?.current_strategy_id ?? null,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (snapshotError || !snapshot) {
      setProgress({
        phase: 'error',
        message: snapshotError?.message ?? 'Failed to create snapshot',
      })
      throw snapshotError ?? new Error('Failed to create snapshot')
    }

    let itemCount = 0
    const failedTabs: string[] = []

    try {
      setProgress({
        tabsTotal: selectedTabs.length,
        message: `Syncing ${selectedTabs.length} tabs...`,
      })
      await supabase
        .from('stash_snapshots')
        .update({ tab_count: selectedTabs.length })
        .eq('id', snapshot.id)

      // Fetch all tabs in parallel
      const results = await Promise.all(
        selectedTabs.map(async (tab) => {
          try {
            const items = await fetchPoeStashTabItems(
              accountName,
              sessId,
              cfClearance,
              league,
              tab.i,
            )
            return { tab, items, failed: false }
          } catch (err) {
            console.error(`Error fetching tab ${tab.n}:`, err)
            failedTabs.push(tab.n)
            return { tab, items: [] as PoeItem[], failed: true }
          }
        }),
      )

      // Insert records sequentially
      for (const { tab, items } of results) {
        const { data: tabRecord } = await supabase
          .from('stash_tabs')
          .insert({
            snapshot_id: snapshot.id,
            user_id: user.id,
            group_id: groupId,
            poe_tab_id: tab.id,
            name: tab.n,
            tab_type: tab.type,
            tab_index: tab.i,
            colour_r: tab.colour?.r,
            colour_g: tab.colour?.g,
            colour_b: tab.colour?.b,
          })
          .select()
          .single()

        if (!tabRecord) continue

        if (items.length > 0) {
          const itemInserts = items.map((item: PoeItem) => ({
            tab_id: tabRecord.id,
            user_id: user.id,
            group_id: groupId,
            poe_item_id: item.id,
            name: item.name || item.typeLine,
            base_type: item.baseType,
            type_line: item.typeLine,
            frame_type: item.frameType,
            ilvl: item.itemLevel ?? item.ilvl ?? 0,
            icon_url: item.icon,
            stack_size: item.stackSize ?? 1,
            identified: item.identified,
            corrupted: item.corrupted ?? false,
            fractured: item.fractured ?? false,
            synthesised: item.synthesised ?? false,
            mods: {
              implicit: item.implicitMods ?? [],
              explicit: item.explicitMods ?? [],
              crafted: item.craftedMods ?? [],
              fractured: item.fracturedMods ?? [],
            },
            raw_data: item,
          }))

          await supabase.from('stash_items').insert(itemInserts)
          itemCount += items.length
        }
      }

      // Mark snapshot complete
      await supabase
        .from('stash_snapshots')
        .update({
          status: 'completed',
          item_count: itemCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', snapshot.id)

      const doneMessage =
        failedTabs.length > 0
          ? `Synced ${selectedTabs.length - failedTabs.length}/${selectedTabs.length} tabs, ${itemCount} items (failed: ${failedTabs.join(', ')})`
          : `Synced ${selectedTabs.length} tabs, ${itemCount} items`
      setProgress({
        phase: failedTabs.length > 0 ? 'error' : 'done',
        message: doneMessage,
      })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.snapshots.latest(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.economy(groupId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })

      return snapshot.id
    } catch (err) {
      // Release the unique constraint so next sync can proceed
      await supabase
        .from('stash_snapshots')
        .update({ status: 'failed', error_msg: String(err) })
        .eq('id', snapshot.id)
      setProgress({ phase: 'error', message: String(err) })
      throw err
    }
  }

  // ── Pricing ───────────────────────────────────────────────────────────────

  /**
   * After a stash snapshot, fetches poe.ninja prices and writes estimated_value_chaos
   * to each stash_tab by computing item totals in memory.
   *
   * Note: per-item price_chaos is intentionally skipped here — upsert with only
   * {id, price_chaos} violates the INSERT side of the RLS check (no user_id provided).
   * Tab totals are computed in-memory instead, which only requires a plain UPDATE.
   */
  const applyPricing = async (groupId: string, league: string, snapshotId: string) => {
    setProgress({ phase: 'pricing', message: 'Fetching prices from poe.ninja…' })

    const { byName, divinePrice } = await fetchAllNinjaPrices(league)

    // 1. Load all tabs for this snapshot
    const { data: tabs, error: tabsError } = await supabase
      .from('stash_tabs')
      .select('id')
      .eq('snapshot_id', snapshotId)

    if (tabsError) throw tabsError

    const tabIds = (tabs ?? []).map((t) => t.id as string)

    // 2. Load all stash_items for those tabs (computing totals in memory)
    //    Scoping by tab_id ensures we only price items from this snapshot,
    //    not from historical ones.
    const { data: items, error: itemsError } = await supabase
      .from('stash_items')
      .select('id, tab_id, type_line, name, stack_size, frame_type')
      .in('tab_id', tabIds)

    if (itemsError) throw itemsError

    // 3. Freeze per-item snapshot pricing so future exclusions can reuse
    //    the original value rather than repricing against current market data.
    const itemPriceUpdates = (items ?? []).map((item) => {
      const key = item.frame_type === 3 ? (item.name as string) : (item.type_line as string)
      const unitPrice = byName.get(key) ?? 0
      const priceChaos = unitPrice * ((item.stack_size as number) ?? 1)
      return {
        id: item.id as string,
        price_chaos: priceChaos,
        price_divine: divinePrice > 0 ? priceChaos / divinePrice : 0,
      }
    })

    // 4. Persist per-item frozen prices and recompute tab totals server-side.
    const { error: pricingError } = await supabase.rpc('bulk_update_snapshot_item_prices', {
      p_snapshot_id: snapshotId,
      p_prices: itemPriceUpdates,
    })

    if (pricingError) throw pricingError

    const { error: historyError } = await supabase.rpc('refresh_snapshot_value_history', {
      p_snapshot_id: snapshotId,
    })

    if (historyError) throw historyError

    setProgress({ phase: 'done', message: `Priced items (1 divine = ${divinePrice.toFixed(0)}c)` })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.economy(groupId)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })
  }

  // ── Group Wealth History ─────────────────────────────────────────────────

  /**
   * After pricing, record a group-level wealth snapshot by aggregating
   * the latest tab values for every member in the group.
   */
  const recordGroupWealthHistory = async (groupId: string, snapshotId: string) => {
    const { error: insertError } = await supabase.rpc('refresh_group_wealth_history_for_snapshot', {
      p_snapshot_id: snapshotId,
    })

    if (insertError) throw insertError

    queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.groupHistory(groupId) })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })
  }

  return { snapshotCharacters, snapshotStash, applyPricing, recordGroupWealthHistory }
}
