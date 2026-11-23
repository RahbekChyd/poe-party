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
  options?: {
    runMapResult?: RunMapResult
    profileTheme?: 'light' | 'dark'
    membershipRole?: 'admin' | 'viewer'
    savedMemberPobs?: { pob_code: string; pob_support_code: string }
  },
) {
  if (workspace !== 'guest') {
    await seedSignedIn(page, workspace === 'none' ? null : groupId)
  }

  const fixtureGroups = [...groups, ...extraGroups]
  const membershipRole = options?.membershipRole ?? 'admin'
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
            role: membershipRole,
            group: result !== undefined && group.id === groupId
              ? { ...group, name: runMapWorkspaceName, current_strategy_id: strategyId }
              : group,
          }))
        : [{ role: membershipRole, user: { ...profile, ...options?.savedMemberPobs } }],
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

export const analysisWorkerTrace = 'Modules/Common.lua:1029: attempt to call method gsub (a nil value)\nstack traceback:\n/app/pob/run-analysis.lua:3828'
export const analysisPobXml = `<PathOfBuilding>
  <Build className="Witch" level="91" />
  <Tree><Spec title="Mapping tree" /><Spec title="Bossing tree" /></Tree>
  <Items><ItemSet id="1" title="Mapping gear" /></Items>
  <Skills><SkillSet id="1" title="Fireball links" /></Skills>
  <Config activeConfigSet="1"><ConfigSet id="1" title="Maps" /></Config>
</PathOfBuilding>`
export const activeLayoutsPobXml = `<PathOfBuilding>
  <Build className="Witch" level="91" />
  <Tree activeSpec="2">
    <Spec title="Progression" treeVersion="3_30" classId="3" nodes="100,101" />
    <Spec title="Progression" treeVersion="3_30" classId="3" nodes="100,102,105" masteryEffects="{105,7}" />
  </Tree>
  <Items activeItemSet="8"><ItemSet id="4" title="Early gear" /><ItemSet id="8" title="Mapping gear" /></Items>
  <Skills activeSkillSet="9"><SkillSet id="3" title="Leveling links" /><SkillSet id="9" title="Fireball links" /></Skills>
  <Config activeConfigSet="6"><ConfigSet id="2" title="Campaign" /><ConfigSet id="6" title="Maps" /></Config>
</PathOfBuilding>`
export const recommendationIconPaths = {
  'Fixture Ward': '/gen/image/fixture-ward.png',
  'Fixture Band': '/image/Art/fixture-band.png',
  'Fixture Crest': 'https://web.poecdn.com/image/Art/fixture-missing-crest.png',
  'Fixture Gloves': 'https://web.poecdn.com/image/Art/fixture-missing-gloves.png',
} as const

export async function mockAnalysisRuns(page: Page, options?: {
  running?: boolean
  failed?: boolean
  notification?: 'completed' | 'partial'
  secondNotification?: boolean
  icons?: boolean
  membershipRole?: 'admin' | 'viewer'
  noSavedTargets?: boolean
  targetXml?: string
  targetMetadata?: Record<string, unknown>
  savedStage?: Record<string, unknown>
  completedSummary?: Record<string, unknown>
  completedMode?: 'quick' | 'thorough'
  savedMemberPobs?: { pob_code: string; pob_support_code: string }
}) {
  await mockApp(page, 'poe1', [standardWorkspace], {
    membershipRole: options?.membershipRole,
    savedMemberPobs: options?.savedMemberPobs,
  })
  const characterId = '70000000-0000-0000-0000-000000000001'
  const targetId = '80000000-0000-0000-0000-000000000001'
  const stageId = '80000000-0000-0000-0000-000000000002'
  const completedId = '90000000-0000-0000-0000-000000000001'
  const runningId = '90000000-0000-0000-0000-000000000002'
  const failedId = '90000000-0000-0000-0000-000000000003'
  const submittedId = '90000000-0000-0000-0000-000000000004'
  const alternateReadyId = '90000000-0000-0000-0000-000000000005'
  const alternateFailedId = '90000000-0000-0000-0000-000000000006'
  const secondReadyId = '90000000-0000-0000-0000-000000000007'
  const now = Date.now()
  const finished = new Date(now - 60_000).toISOString()
  const started = new Date(now - 10_000).toISOString()
  const startedEarlier = new Date(now - 20_000).toISOString()
  const otherTarget = '80000000-0000-0000-0000-000000000005'
  const target = {
    id: targetId, group_id: groupId, user_id: userId, character_id: characterId,
    created_by: userId, name: 'Fixture build', source_kind: 'pob_xml',
    compatibility_status: 'compatible', is_selected: true, selected_stage_id: stageId, created_at: finished,
    import_metadata: options?.targetMetadata ?? { class_name: 'Witch', source_kind: 'pob_xml', tree_specs: [], item_sets: [], skill_sets: [], config_sets: [] },
    raw_import: options?.targetXml ?? analysisPobXml, raw_xml: options?.targetXml ?? analysisPobXml,
  }
  const character = {
    id: characterId, user_id: userId, name: 'Fixture Witch', class: 'Witch', level: 91, is_active: true,
  }
  const alternateCharacter = {
    ...character, id: '70000000-0000-0000-0000-000000000002', name: 'Fixture Ranger',
    class: 'Ranger', level: 88, is_active: false,
  }
  const alternateTarget = {
    ...target, id: '80000000-0000-0000-0000-000000000003', name: 'Fixture Ranger build',
    character_id: alternateCharacter.id, selected_stage_id: '80000000-0000-0000-0000-000000000004',
  }
  await page.route('**/rest/v1/characters?*', (route) => {
    const activeOnly = new URL(route.request().url()).searchParams.get('is_active') === 'eq.true'
    return route.fulfill({ json: options?.notification && !activeOnly ? [character, alternateCharacter] : [character] })
  })
  let importedTarget: (Omit<typeof target, 'selected_stage_id'> & { selected_stage_id: string | null }) | null = null
  let importedTargetCount = 0
  await page.route('**/rest/v1/build_targets?*', (route) => {
    if (route.request().method() === 'POST') {
      importedTargetCount += 1
      importedTarget = {
        ...target,
        ...route.request().postDataJSON(),
        id: '80000000-0000-0000-0000-000000000006',
        selected_stage_id: null,
      }
      return route.fulfill({ json: importedTarget })
    }
    if (route.request().method() === 'PATCH') {
      if (importedTarget && route.request().url().includes(importedTarget.id)) {
        importedTarget = { ...importedTarget, ...route.request().postDataJSON() }
        return route.fulfill({ json: importedTarget })
      }
      Object.assign(target, route.request().postDataJSON())
      return route.fulfill({ json: target })
    }
    const idFilter = new URL(route.request().url()).searchParams.get('id')
    const targets = [
      ...(importedTarget ? [importedTarget] : []),
      ...(options?.noSavedTargets ? [] : options?.notification ? [target, alternateTarget] : [target]),
    ]
    return route.fulfill({ json: idFilter ? targets.find(({ id }) => `eq.${id}` === idFilter) : targets })
  })
  await page.route('**/rest/v1/rpc/set_selected_build_target', (route) => {
    const id = route.request().postDataJSON()?.p_build_target_id
    if (importedTarget && importedTarget.id === id) importedTarget = { ...importedTarget, is_selected: true }
    return route.fulfill({ json: importedTarget?.id === id ? importedTarget : target })
  })
  let savedSetup: Record<string, unknown> | null = null
  await page.route('**/rest/v1/build_target_stages?*', (route) => {
    const targetFilter = new URL(route.request().url()).searchParams.get('build_target_id')
    if (route.request().method() === 'POST' || route.request().method() === 'PATCH') {
      savedSetup = { id: stageId, build_target_id: targetFilter?.slice(3), ...route.request().postDataJSON() }
      return route.fulfill({ json: savedSetup })
    }
    if (savedSetup && targetFilter === `eq.${savedSetup.build_target_id}`) return route.fulfill({ json: [savedSetup] })
    if (importedTarget && targetFilter === `eq.${importedTarget.id}`) return route.fulfill({ json: [] })
    const isAlternate = targetFilter === `eq.${alternateTarget.id}`
    const selected = isAlternate ? alternateTarget : target
    return route.fulfill({ json: [{
      id: selected.selected_stage_id, build_target_id: selected.id, label: 'Current setup', primary_offensive_metric: 'totalDps',
      ...options?.savedStage,
    }] })
  })

  const shared = {
    group_id: groupId, build_target_id: targetId, target_stage_id: stageId,
    target_user_id: userId, character_id: characterId, queued_by: userId,
  }
  let submittedRun: Record<string, unknown> | null = null
  let submissionError: { status: number; error: string } | null = null
  let submissionBody: Record<string, unknown> | null = null
  let reuseSubmission = false
  let alternateStatus: 'running' | 'completed' | 'partial' = options?.notification ? 'running' : 'completed'
  let secondStatus: 'running' | 'partial' = 'running'
  const running = {
    ...shared, id: runningId, build_target_id: otherTarget,
    status: 'running', stale_reason: null as string | null,
    started_at: startedEarlier, created_at: startedEarlier,
    summary: { current_phase: { id: 'scoring_upgrades', started_at: startedEarlier } },
  }
  await page.route('**/rest/v1/rpc/cancel_upgrade_analysis_run', (route) => {
    if (route.request().postDataJSON()?.p_run_id !== runningId) {
      return route.fulfill({ status: 404, json: { error: 'Unknown fixture run' } })
    }
    running.status = 'stale'
    running.stale_reason = 'user-cancelled'
    return route.fulfill({ json: running })
  })
  await page.route('**/functions/v1/poe-sync-character-profile', (route) => route.fulfill({ json: {} }))
  await page.route('**/functions/v1/queue-upgrade-analysis', (route) => {
    submissionBody = route.request().postDataJSON()
    if (submissionError) return route.fulfill({ status: submissionError.status, json: { error: submissionError.error } })
    submittedRun = reuseSubmission ? null : {
      ...shared, id: submittedId, status: 'queued', created_at: new Date().toISOString(),
    }
    const run = submittedRun ?? { ...shared, id: completedId, status: 'completed', created_at: finished, completed_at: finished }
    return route.fulfill({ json: { run, reused: reuseSubmission, worker_notified: !reuseSubmission } })
  })

  let recommendationRequests = 0
  let completedRunIsStale = false
  await page.route('**/rest/v1/upgrade_analysis_runs?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    const targetFilter = query.get('build_target_id')
    const idFilter = query.get('id')
    const completed = {
      ...shared, id: completedId,
      status: completedRunIsStale ? 'stale' : 'completed',
      stale_reason: completedRunIsStale ? 'character-profile-updated' : null,
      started_at: finished,
      completed_at: finished, created_at: finished, analysis_mode: options?.completedMode ?? 'quick',
      summary: { generated_plan_count: 3, baseline_metrics: { totalDps: 500_000, totalEhp: 42_000 }, ...options?.completedSummary },
    }
    const failed = {
      ...shared, id: failedId, status: 'failed', started_at: started, completed_at: started,
      created_at: started, error_detail: analysisWorkerTrace,
    }
    const alternateRun = {
      ...completed, id: alternateReadyId, character_id: alternateCharacter.id,
      build_target_id: alternateTarget.id, target_stage_id: alternateTarget.selected_stage_id,
      status: alternateStatus, created_at: started, completed_at: alternateStatus === 'running' ? null : new Date().toISOString(),
    }
    const runs = [
      ...(submittedRun ? [submittedRun] : []),
      ...(options?.running ? [running] : []),
      ...(options?.failed ? [failed] : []),
      ...(options?.notification ? [
        { ...alternateRun, id: alternateFailedId, status: 'failed', created_at: new Date(now - 5_000).toISOString() },
        alternateRun,
      ] : []),
      ...(options?.secondNotification ? [{
        ...completed, id: secondReadyId, build_target_id: otherTarget,
        status: secondStatus, created_at: startedEarlier,
        completed_at: secondStatus === 'running' ? null : new Date().toISOString(),
      }] : []),
      completed,
    ].filter((run) => (
      (!query.has('group_id') || query.get('group_id') === `eq.${groupId}`)
      && (!query.has('target_user_id') || query.get('target_user_id') === `eq.${userId}`)
      && (!targetFilter || targetFilter === `eq.${run.build_target_id}`)
      && (!idFilter || idFilter === `eq.${run.id}`)
      && (!query.has('or') || (run.status !== 'failed' && !('stale_reason' in run && run.stale_reason === 'user-cancelled')))
    )).map((run) => ({
      ...run,
      character: { name: run.character_id === alternateCharacter.id ? alternateCharacter.name : character.name },
      target: { name: run.build_target_id === alternateTarget.id ? alternateTarget.name : target.name },
      ...(run.status === 'completed' || run.status === 'partial' || (run.id === completedId && completedRunIsStale)
        ? { recommendation_count: 3, hit_dps: 500_000, effective_hit_pool: 42_000 }
        : {}),
    })).sort((left, right) =>
      String(right.created_at).localeCompare(String(left.created_at)) || String(right.id).localeCompare(String(left.id)),
    )
    const offset = Number(query.get('offset') ?? 0)
    const limit = Number(query.get('limit') ?? runs.length)
    return route.fulfill({ json: runs.slice(offset, offset + limit) })
  })

  await page.route('**/rest/v1/upgrade_recommendation_plans?*', (route) => {
    recommendationRequests += 1
    const runId = new URL(route.request().url()).searchParams.get('run_id')?.replace(/^eq\./, '')
    const recommendations = runId === completedId
      ? [
          { title: 'Fixture Ward', rarity: 'Rare', base: 'Vaal Regalia', slot: 'Body Armour' },
          { title: 'Fixture Band', rarity: 'Rare', base: 'Amethyst Ring', slot: 'Ring 1' },
          { title: 'Fixture Crest', rarity: 'Unique', base: 'Hubris Circlet', slot: 'Helmet' },
          ...(options?.icons ? [{ title: 'Fixture Gloves', rarity: 'Rare', base: 'Titan Gauntlets', slot: 'Gloves' }] : []),
        ]
      : runId === submittedId && submittedRun?.status === 'completed'
        ? [{ title: 'New Fixture Ward', rarity: 'Rare', base: 'Vaal Regalia', slot: 'Body Armour' }]
        : runId === alternateReadyId
          ? [{ title: 'Fixture Stormcoat', rarity: 'Rare', base: 'Full Dragonscale', slot: 'Body Armour' }]
          : []
    return route.fulfill({ json: recommendations.map(({ title, rarity, base, slot }, index) => {
      const planId = `fixture-plan-${index}`
      const icon = options?.icons ? recommendationIconPaths[title as keyof typeof recommendationIconPaths] : undefined
      return {
        id: planId, run_id: runId, group_id: groupId, target_user_id: userId,
        category: 'best_single', kind: 'single', section: 'primary', title,
        score: 20 - index, effective_cost_chaos: 65 + index, created_at: finished,
        before_metrics: { full_dps: 500000 }, after_metrics: { full_dps: 650000 },
        items: [{
          id: `fixture-item-${index}`, plan_id: planId, run_id: runId, slot,
          source: 'market', item_name: title, effective_price_chaos: 65 + index,
          item_payload: {
            rarity, base_type: title === 'Fixture Gloves' ? undefined : base, type_line: base,
            raw_text: `Rarity: ${rarity}\n${title}\n${base}`, icon_url: icon,
          },
        }],
      }
    }) })
  })
  return {
    characterId,
    completedId,
    runningId,
    failedId,
    submittedId,
    alternateReadyId,
    countRecommendationRequests: () => recommendationRequests,
    countTargetImports: () => importedTargetCount,
    getSavedSetup: () => savedSetup,
    getSubmissionBody: () => submissionBody,
    failSubmission: (error: { status: number; error: string } | null) => { submissionError = error },
    reuseExistingRun: () => { reuseSubmission = true },
    finishAlternateRun: () => { alternateStatus = options?.notification ?? 'completed' },
    finishSecondRun: () => { secondStatus = 'partial' },
    markCompletedRunStale: () => { completedRunIsStale = true },
    completeSubmittedRun: () => {
      if (!submittedRun) throw new Error('No fixture analysis was queued')
      submittedRun = { ...submittedRun, status: 'completed', completed_at: new Date().toISOString() }
    },
  }
}
