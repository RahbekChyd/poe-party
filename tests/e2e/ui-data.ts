import type { Page } from '@playwright/test'
import { groupId, seedSignedIn, user, userId } from './fixture'

export const poe2GroupId = '20000000-0000-0000-0000-000000000002'
export const profileId = '30000000-0000-0000-0000-000000000001'
export const serviceId = '40000000-0000-0000-0000-000000000001'
export const strategyId = '50000000-0000-0000-0000-000000000001'
export const gearId = '60000000-0000-0000-0000-000000000001'

const date = '2026-11-18T00:00:00Z'
export const groupName = 'FixturePartyWithAnUnbrokenName'.repeat(3)
export const characterName = 'FixtureCharacterWithAnUnbrokenName'.repeat(2)
export const serviceTitle = 'FixtureServiceWithAnUnbrokenName'.repeat(3)
export const strategyName = 'FixtureStrategyWithAnUnbrokenName'.repeat(2).slice(0, 64)
const notes = 'NotesWithAnUnbrokenWord'.repeat(12)

const groups = [
  {
    id: groupId, name: groupName, game: 'poe1', league: 'Covens', created_at: date,
    created_by: userId, description: notes, invite_code: 'FIXTURE', is_solo: false,
    current_strategy_id: null,
  },
  {
    id: poe2GroupId, name: 'PoE2 Fixture Party', game: 'poe2', league: 'Fixture League 2',
    created_at: date, created_by: userId, description: null, invite_code: 'FIXTURE2',
    is_solo: false, current_strategy_id: null,
  },
]

export const standardWorkspace = {
  ...groups[0],
  id: '20000000-0000-0000-0000-000000000003',
  name: 'Standard Fixture Party',
  league: 'Standard',
}

const profile = {
  ...user, display_name: 'Fixture Player', poe_account_name: 'Fixture#0001',
  avatar_url: null, avatar_color: null, has_seen_early_access_notice: true, theme: 'dark',
  subscription_tier: 'free', subscription_expires_at: null, poe_token_expires_at: null,
}

export const runMapStrategyName = 'Breach Beacon Loop'
export const runMapWorkspaceName = 'Beacon Party'

type RunMapResult = 'complete' | 'partial' | 'unavailable' | null

function records(group: typeof groups[number]) {
  const publicGroup = {
    group_id: group.id, group_name: group.name, game: group.game, league: group.league,
    public_character_count: 1,
  }
  const character = {
    profile_id: profileId, group_id: group.id, group_name: group.name, group_game: group.game,
    owner_name: profile.display_name, character_name: characterName, league: group.league,
    level: 91, class: group.game === 'poe2' ? 'Sorceress' : 'Witch', ascendancy_class: null,
  }
  const service = {
    id: serviceId, group_id: group.id, group_name: group.name, group_game: group.game,
    group_league: group.league, user_id: userId, owner_name: profile.display_name,
    service_type: 'boss_carry', title: serviceTitle, description: notes,
    region: null, price_divine: 2, poe_ign: 'FixtureCharacter', availability: 'available',
    visibility: 'public', mod_exclusions: [], details: {}, is_active: true,
    created_at: date, updated_at: date,
  }
  const strategy = {
    id: strategyId, group_id: group.id, group_name: group.name, group_game: group.game,
    group_league: group.league, name: strategyName, description: notes, colour: '#f5a524',
    difficulty: 'normal', is_active: true, visibility: 'public', created_at: date,
    created_by: userId, scarabs: [], threads: [], map_requirements: {}, map_cost: null,
    source_strategy_id: null, subscription_state: null, admin_locked: false,
  }
  const gear = {
    id: gearId, group_id: group.id, target_user_id: userId, suggested_by: userId,
    item_name: 'Fixture Wand', item_data: null, item_trade_link: null, notes, importance: 'high',
    status: 'open', status_note: null, created_at: date, admin_locked: false,
    action_type: 'gear_item', action_payload: {}, source_recommendation_plan_id: null,
    target_user: profile, suggester: profile,
  }
  return { publicGroup, character, service, strategy, gear }
}

export async function mockApp(
  page: Page,
  workspace: 'poe1' | 'none' | 'guest' = 'guest',
  extraGroups: typeof groups = [],
  options?: { runMapResult?: RunMapResult; profileTheme?: 'light' | 'dark' },
) {
  if (workspace !== 'guest') {
    await seedSignedIn(page, workspace === 'none' ? null : groupId)
  }

  const fixtureGroups = [...groups, ...extraGroups]
  const now = Date.now()
  const result = options?.runMapResult
  const runMapHistory = result ? [680, 1040, 1450, 1710, 1960].map((total, index, values) => {
    const daysAgo = values.length - index - 1
    const isLatest = daysAgo === 0
    const status = isLatest ? result : 'complete'
    const createdAt = new Date(now - daysAgo * 86_400_000 - 18 * 60_000).toISOString()
    return {
      id: `run-map-wealth-${index}`,
      group_id: groupId,
      created_at: createdAt,
      total_wealth_chaos: status === 'unavailable' ? 0 : total,
      member_count: 1,
      strategy_id: strategyId,
      triggered_by_user_id: userId,
      triggered_by_snapshot_id: isLatest ? 'run-map-snapshot' : null,
      member_wealth_breakdown: [],
      pricing_summary: {
        status, version: 1, source: 'poe.ninja', priced_at: createdAt, divine_price: 175,
        priced_item_count: status === 'unavailable' ? 0 : 24,
        unpriced_item_count: status === 'complete' ? 0 : 3,
        failed_categories: status === 'complete' ? [] : ['Currency'],
      },
    }
  }) : []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const resource = url.pathname.split('/').at(-1) ?? ''
    const query = url.searchParams
    const body = request.method() === 'POST' ? request.postDataJSON() : null
    const currentGroup = fixtureGroups.find((group) =>
      body?.p_game === group.game ||
      body?.p_viewer_group_id === group.id ||
      query.get('group_id') === `eq.${group.id}`,
    ) ?? fixtureGroups[0]
    const { publicGroup, character, service, strategy, gear } = records(currentGroup)
    const isRunMapGroup = result !== undefined && currentGroup.id === groupId
    const activeStrategy = isRunMapGroup
      ? { ...strategy, name: runMapStrategyName, description: 'Breach sustain for short mapping sessions.' }
      : strategy
    const history = isRunMapGroup ? runMapHistory : []
    const latest = history.at(-1)
    const responses: Record<string, unknown> = {
      users: {
        ...profile,
        theme: options?.profileTheme ?? profile.theme,
        poe_token_expires_at: result !== undefined ? new Date(now + 86_400_000).toISOString() : null,
      },
      group_members: query.get('select')?.includes('group:groups')
        ? workspace === 'none' ? [] : fixtureGroups.map((group) => ({
            role: 'admin',
            group: result !== undefined && group.id === groupId
              ? { ...group, name: runMapWorkspaceName, current_strategy_id: strategyId }
              : group,
          }))
        : [{ role: 'admin', user: profile }],
      gear_suggestions: query.has('id') ? gear : [gear],
      services: query.has('id') ? service : [service],
      strategies: query.has('id') ? activeStrategy : [activeStrategy],
      group_wealth_history: history,
      latest_snapshots: latest ? [{
        id: 'run-map-snapshot', user_id: userId, group_id: groupId,
        completed_at: latest.created_at, tab_count: 1, item_count: 24,
        pricing_summary: latest.pricing_summary,
      }] : [],
      stash_tabs: latest ? [{
        id: 'run-map-tab', snapshot_id: 'run-map-snapshot', user_id: userId,
        name: 'Currency', tab_type: 'CurrencyStash', estimated_value_chaos: latest.total_wealth_chaos,
      }] : [],
      list_public_services_for_league: [service],
      list_public_services: [service],
      list_public_strategies_for_league: [strategy],
      list_public_strategies: [strategy],
      get_public_strategy_preview: [strategy],
      get_public_strategy_detail: [strategy],
      search_public_characters_for_league: [character],
      search_public_characters: [character],
      search_public_groups_for_league: [{ ...publicGroup, characters: [character] }],
      search_public_groups: [{ ...publicGroup, characters: [character] }],
      get_public_group_detail_preview: [publicGroup],
      get_public_group_detail: [publicGroup],
      list_public_group_characters_preview: [character],
      list_public_group_characters: [character],
      get_public_character_detail_preview: [{ ...character, id: profileId, user_id: userId, visibility: 'public' }],
      get_public_character_detail: [{ ...character, id: profileId, user_id: userId, visibility: 'public' }],
    }

    return route.fulfill({ json: responses[resource] ?? [] })
  })
}

export async function mockAnalysisRuns(page: Page, includeRunning = false) {
  await mockApp(page, 'poe1')
  const characterId = '70000000-0000-0000-0000-000000000001'
  const targetId = '80000000-0000-0000-0000-000000000001'
  const completedId = '90000000-0000-0000-0000-000000000001'
  const runningId = '90000000-0000-0000-0000-000000000002'
  const now = Date.now()
  const finished = new Date(now - 60_000).toISOString()
  const started = new Date(now - 10_000).toISOString()
  const target = {
    id: targetId, group_id: groupId, user_id: userId, character_id: characterId,
    created_by: userId, name: 'Fixture build', source_kind: 'pob_xml',
    compatibility_status: 'compatible', is_selected: true, created_at: finished,
  }
  await page.route('**/rest/v1/characters?*', (route) => route.fulfill({ json: [{
    id: characterId, user_id: userId, name: 'Fixture Witch', class: 'Witch', level: 91, is_active: true,
  }] }))
  await page.route('**/rest/v1/build_targets?*', (route) => {
    const isDetail = new URL(route.request().url()).searchParams.has('id')
    return route.fulfill({ json: isDetail ? target : [target] })
  })

  let historyRequests = 0
  await page.route('**/rest/v1/upgrade_analysis_runs?*', (route) => {
    if (new URL(route.request().url()).searchParams.has('build_target_id')) historyRequests += 1
    const shared = {
      group_id: groupId, build_target_id: targetId, target_user_id: userId,
      character_id: characterId, queued_by: userId,
    }
    const completed = {
      ...shared, id: completedId, status: 'completed', started_at: finished,
      completed_at: finished, created_at: finished, summary: { generated_plan_count: 3 },
    }
    const running = {
      ...shared, id: runningId, status: 'running', started_at: started, created_at: started,
      summary: { fixture_refresh: historyRequests },
    }
    return route.fulfill({ json: includeRunning ? [running, completed] : [completed] })
  })

  await page.route('**/rest/v1/upgrade_recommendation_plans?*', (route) => {
    const runId = new URL(route.request().url()).searchParams.get('run_id')
    return route.fulfill({ json: runId === `eq.${completedId}` ? [
      { title: 'Fixture Ward', rarity: 'Rare', base: 'Vaal Regalia', slot: 'Body Armour' },
      { title: 'Fixture Band', rarity: 'Rare', base: 'Amethyst Ring', slot: 'Ring 1' },
      { title: 'Fixture Crest', rarity: 'Unique', base: 'Hubris Circlet', slot: 'Helmet' },
    ].map(({ title, rarity, base, slot }, index) => {
      const planId = `fixture-plan-${index}`
      return {
        id: planId, run_id: completedId, group_id: groupId, target_user_id: userId,
        category: 'best_single', kind: 'single', section: 'primary', title,
        score: 20 - index, effective_cost_chaos: 65 + index, created_at: finished,
        before_metrics: { full_dps: 500000 }, after_metrics: { full_dps: 650000 },
        items: [{
          id: `fixture-item-${index}`, plan_id: planId, run_id: completedId, slot,
          source: 'market', item_name: title, effective_price_chaos: 65 + index,
          item_payload: { rarity, type_line: base, raw_text: `Rarity: ${rarity}\n${title}\n${base}` },
        }],
      }
    }) : [] })
  })
  return () => historyRequests
}
