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
export const strategyName = 'FixtureStrategyWithAnUnbrokenName'.repeat(3)
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

const profile = {
  ...user, display_name: 'Fixture Player', poe_account_name: 'Fixture#0001',
  avatar_url: null, avatar_color: null, has_seen_early_access_notice: true, theme: 'dark',
  subscription_tier: 'free', subscription_expires_at: null, poe_token_expires_at: null,
}

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
) {
  if (workspace !== 'guest') {
    await seedSignedIn(page, workspace === 'none' ? null : groupId)
  }

  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const resource = url.pathname.split('/').at(-1) ?? ''
    const query = url.searchParams
    const body = request.method() === 'POST' ? request.postDataJSON() : null
    const currentGroup = groups.find((group) =>
      body?.p_game === group.game ||
      body?.p_viewer_group_id === group.id ||
      query.get('group_id') === `eq.${group.id}`,
    ) ?? groups[0]
    const { publicGroup, character, service, strategy, gear } = records(currentGroup)
    const responses: Record<string, unknown> = {
      users: profile,
      group_members: query.get('select')?.includes('group:groups')
        ? workspace === 'none' ? [] : groups.map((group) => ({ role: 'admin', group }))
        : [{ role: 'admin', user: profile }],
      gear_suggestions: query.has('id') ? gear : [gear],
      services: query.has('id') ? service : [service],
      strategies: query.has('id') ? strategy : [strategy],
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
