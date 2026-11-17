import { priceSnapshotItems, unavailableSnapshotPricing } from '../_shared/ninja-economy-server.ts'
import { normalizePoeItemModLines, getPoeItemModLinesByFlag } from '../_shared/poe-item-mods.ts'
import type { NinjaRecord } from '../_shared/ninja-economy.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { PoeApiClient } from '../_shared/poe-api-client.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ensureFreshPoeAccessToken } from '../_shared/poe-token-store.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'
import { normalizeCharacterClassInfo } from '../_shared/poe-character-class.ts'
import { getPoeRealm, normalizePoeGame, supportsStashSnapshots } from '../_shared/poe-game.ts'

function parseHexColour(hex?: string): { r: number; g: number; b: number } {
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: 128, g: 128, b: 128 }
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const message = 'message' in error ? error.message : undefined
    if (typeof message === 'string' && message.length > 0) return message

    const code = 'code' in error ? error.code : undefined
    const details = 'details' in error ? error.details : undefined
    const hint = 'hint' in error ? error.hint : undefined

    try {
      return JSON.stringify({ message, code, details, hint })
    } catch {
      return String(error)
    }
  }
  return String(error)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const {
      group_id,
      user_id,
      league: requestedLeague,
      selected_tab_ids,
    } = (await req.json()) as {
      group_id: string
      user_id: string
      league?: string
      selected_tab_ids?: string[]
    }

    if (!group_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (authenticatedUser.id !== user_id) {
      return new Response(JSON.stringify({ error: 'Cannot snapshot another user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()

    const [{ data: userData }, { data: groupData }, { data: membership }] = await Promise.all([
      adminClient.from('users').select('poe_account_name').eq('id', user_id).single(),
      adminClient
        .from('groups')
        .select('current_strategy_id, game, league')
        .eq('id', group_id)
        .single(),
      adminClient
        .from('group_members')
        .select('role')
        .eq('group_id', group_id)
        .eq('user_id', user_id)
        .maybeSingle(),
    ])

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this group' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!userData?.poe_account_name) {
      return new Response(JSON.stringify({ error: 'User account name not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const game = normalizePoeGame(groupData?.game)
    const league = typeof groupData?.league === 'string' ? groupData.league : ''

    if (!league || (requestedLeague && requestedLeague !== league)) {
      return new Response(
        JSON.stringify({ error: 'Snapshot league must match the group league' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!supportsStashSnapshots(game)) {
      return new Response(
        JSON.stringify({
          error: 'Stash snapshots are currently only supported for Path of Exile 1 groups.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const accessToken = await ensureFreshPoeAccessToken(user_id)

    await adminClient
      .from('stash_snapshots')
      .update({ status: 'failed', error_msg: 'Superseded by new snapshot' })
      .eq('user_id', user_id)
      .eq('group_id', group_id)
      .in('status', ['pending', 'in_progress'])

    const { data: snapshot, error: snapshotError } = await adminClient
      .from('stash_snapshots')
      .insert({
        user_id,
        group_id,
        strategy_id: groupData?.current_strategy_id ?? null,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (snapshotError || !snapshot) {
      return new Response(JSON.stringify({ error: 'Failed to create snapshot record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    try {
      const poeClient = new PoeApiClient(accessToken)
      const { characters } = await poeClient.getCharacters(getPoeRealm(game))
      const leagueChars = characters.filter((c) => c.league === league)

      if (leagueChars.length > 0) {
        const { error: charactersError } = await adminClient.from('characters').upsert(
          leagueChars.map((c) => {
            const normalized = normalizeCharacterClassInfo(game, c.class, c.ascendancyClass ?? 0)
            return {
              user_id,
              group_id,
              poe_character_id: c.id,
              name: c.name,
              league: c.league,
              class: normalized.className,
              ascendancy_class: normalized.ascendancyClass,
              level: c.level,
              experience: c.experience,
              is_active: c.current ?? false,
              raw_data: c,
              snapshotted_at: new Date().toISOString(),
            }
          }),
          { onConflict: 'user_id,group_id,poe_character_id' },
        )

        if (charactersError) throw charactersError
      }

      const { stashes } = await poeClient.listStashes(league)
      const visibleTabs = stashes.filter(
        (t) => !(t as { hidden?: boolean }).hidden && t.type !== 'Folder',
      )
      const selectedTabIds = selected_tab_ids ?? []
      const tabsToSnapshot =
        selectedTabIds.length > 0
          ? visibleTabs.filter((tab) => selectedTabIds.includes(tab.id))
          : visibleTabs

      if (tabsToSnapshot.length === 0) {
        throw new Error('No valid stash tabs selected for snapshot')
      }

      await adminClient
        .from('stash_snapshots')
        .update({ tab_count: tabsToSnapshot.length })
        .eq('id', snapshot.id)

      let itemCount = 0

      for (const tab of tabsToSnapshot) {
        const { stash: tabWithItems } = await poeClient.getStash(
          league,
          tab.parent ?? tab.id,
          tab.parent ? tab.id : undefined,
        )
        const resolvedTab =
          tab.parent && tabWithItems?.children?.length
            ? (tabWithItems.children.find((child) => child.id === tab.id) ?? tabWithItems)
            : tabWithItems
        const colour = parseHexColour(tab.metadata?.colour)

        const { data: tabRecord, error: tabInsertError } = await adminClient
          .from('stash_tabs')
          .insert({
            snapshot_id: snapshot.id,
            user_id,
            group_id,
            poe_tab_id: tab.id,
            name: resolvedTab?.name ?? tab.name,
            tab_type: tab.type,
            tab_index: tab.index,
            colour_r: colour.r,
            colour_g: colour.g,
            colour_b: colour.b,
          })
          .select()
          .single()

        if (tabInsertError) throw tabInsertError
        if (!tabRecord) continue

        const items = resolvedTab?.items ?? []
        if (items.length === 0) continue

        const { error: itemInsertError } = await adminClient.from('stash_items').insert(
          items.map((item) => ({
            tab_id: tabRecord.id,
            user_id,
            group_id,
            poe_item_id: item.id,
            name: item.name || item.typeLine,
            base_type: item.baseType,
            type_line: item.typeLine,
            frame_type:
              item.frameType ??
              (
                {
                  normal: 0,
                  magic: 1,
                  rare: 2,
                  unique: 3,
                  gem: 4,
                  currency: 5,
                  divination: 6,
                  foil: 9,
                  viscera: 15,
                } as Record<string, number>
              )[String(item.frameTypeId ?? item.rarity).toLowerCase()] ??
              0,
            ilvl: item.itemLevel ?? item.ilvl ?? 0,
            sockets: item.sockets ?? [],
            icon_url: item.icon,
            stack_size: item.stackSize ?? 1,
            identified: item.identified,
            corrupted: item.corrupted ?? false,
            fractured: item.fractured ?? false,
            synthesised: item.synthesised ?? false,
            mods: {
              implicit: normalizePoeItemModLines(item.implicitMods),
              explicit: normalizePoeItemModLines(item.explicitMods),
              crafted: [
                ...normalizePoeItemModLines(item.craftedMods),
                ...getPoeItemModLinesByFlag(item.explicitMods, 'crafted'),
              ],
              fractured: [
                ...normalizePoeItemModLines(item.fracturedMods),
                ...getPoeItemModLinesByFlag(item.explicitMods, 'fractured'),
              ],
            },
            raw_data: item,
          })),
        )

        if (itemInsertError) throw itemInsertError

        itemCount += items.length
      }

      const { data: tabs, error: tabsError } = await adminClient
        .from('stash_tabs')
        .select('id')
        .eq('snapshot_id', snapshot.id)
      if (tabsError) throw tabsError
      const tabIds = (tabs ?? []).map((tab) => tab.id as string)
      const items: NinjaRecord[] = []
      for (let offset = 0; tabIds.length > 0; offset += 500) {
        const { data, error } = await adminClient
          .from('stash_items')
          .select('id, type_line, name, base_type, stack_size, frame_type, raw_data')
          .in('tab_id', tabIds)
          .order('id')
          .range(offset, offset + 499)
        if (error) throw error
        items.push(...(data ?? []))
        if (!data || data.length < 500) break
      }
      let valuation
      try {
        valuation = await priceSnapshotItems(league, items)
      } catch {
        valuation = unavailableSnapshotPricing(items)
      }
      const warning =
        valuation.summary.status === 'complete'
          ? null
          : `Snapshot captured. Pricing ${valuation.summary.status}; ${valuation.summary.unpriced_item_count} items have no estimate.`
      const { error: finalizeError } = await adminClient.rpc('finalize_priced_snapshot', {
        p_snapshot_id: snapshot.id,
        p_prices: valuation.prices,
        p_summary: valuation.summary,
        p_warning: warning,
      })
      if (finalizeError) throw finalizeError

      return new Response(
        JSON.stringify({
          snapshot_id: snapshot.id,
          tab_count: tabsToSnapshot.length,
          item_count: itemCount,
          warning,
          pricing: valuation.summary,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (error) {
      await adminClient
        .from('stash_snapshots')
        .update({ status: 'failed', error_msg: toErrorMessage(error) })
        .eq('id', snapshot.id)

      throw error
    }
  } catch (err) {
    console.error('Snapshot error:', err)
    return new Response(
      JSON.stringify({ error: 'Snapshot failed', details: toErrorMessage(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
