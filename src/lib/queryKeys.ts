import type { PoeGame } from './poe-game'
export const queryKeys = {
  currentUser: ['current-user'] as const,
  myProfile: (userId: string | undefined) => ['my-profile', userId] as const,

  groups: {
    mine: ['groups', 'mine'] as const,
    members: (groupId: string | null) => ['groups', groupId, 'members'] as const,
  },

  snapshots: {
    latest: (groupId: string | null) => ['snapshots', 'latest', groupId] as const,
    items: (groupId: string | null, userId: string | null, snapshotId?: string | null) =>
      ['snapshot-items', groupId, userId, snapshotId ?? 'latest'] as const,
    groupItems: (groupId: string | null) => ['group-snapshot-items', groupId] as const,
    history: (groupId: string | null, userId: string | null) =>
      ['snapshot-history', groupId, userId] as const,
    groupHistory: (groupId: string | null) =>
      ['group-wealth-history', groupId] as const,
  },

  characters: {
    active: (groupId: string | null) => ['characters', 'active', groupId] as const,
    mineGroup: (groupId: string | null) => ['my-characters', groupId] as const,
    mine: (groupId: string | null, league?: string | null) =>
      ['my-characters', groupId, league] as const,
  },

  characterProfiles: {
    root: ['character-profiles'] as const,
    group: (groupId: string | null) => ['character-profiles', groupId] as const,
    dailySummaries: (
      groupId: string | null,
      profileId: string | null,
      characterId: string | null,
    ) => ['character-profiles', 'daily-summaries', groupId, profileId, characterId] as const,
    dailyDetail: (groupId: string | null, dailySnapshotId: string | null) =>
      ['character-profiles', 'daily-detail', groupId, dailySnapshotId] as const,
  },

  publicDirectory: {
    characters: (groupId: string | null, query: string) =>
      ['public-directory', 'characters', groupId, query] as const,
    groups: (groupId: string | null, query: string) =>
      ['public-directory', 'groups', groupId, query] as const,
    groupDetail: (groupId: string | null, publicGroupId: string | null) =>
      ['public-directory', 'group-detail', groupId, publicGroupId] as const,
    characterDetail: (groupId: string | null, profileId: string | null) =>
      ['public-directory', 'character-detail', groupId, profileId] as const,
    characterDailySummaries: (groupId: string | null, profileId: string | null) =>
      ['public-directory', 'character-daily-summaries', groupId, profileId] as const,
    characterDailyDetail: (
      groupId: string | null,
      profileId: string | null,
      dailySnapshotId: string | null,
    ) => ['public-directory', 'character-daily-detail', groupId, profileId, dailySnapshotId] as const,
    groupCharacters: (groupId: string | null, publicGroupId: string | null, excludeProfileId?: string | null) =>
      ['public-directory', 'group-characters', groupId, publicGroupId, excludeProfileId ?? null] as const,
  },

  preview: {
    strategies: (game: PoeGame | null, league: string | null) =>
      ['preview', 'strategies', game, league] as const,
    strategy: (strategyId: string | null) => ['preview', 'strategy', strategyId] as const,
    characterSearch: (game: PoeGame | null, league: string | null, query: string) =>
      ['preview', 'directory', 'characters', game, league, query] as const,
    groupSearch: (game: PoeGame | null, league: string | null, query: string) =>
      ['preview', 'directory', 'groups', game, league, query] as const,
    characterDetail: (profileId: string | null) =>
      ['preview', 'directory', 'character-detail', profileId] as const,
    characterDailySummaries: (profileId: string | null) =>
      ['preview', 'directory', 'character-daily-summaries', profileId] as const,
    characterDailyDetail: (profileId: string | null, dailySnapshotId: string | null) =>
      ['preview', 'directory', 'character-daily-detail', profileId, dailySnapshotId] as const,
    groupDetail: (groupId: string | null) =>
      ['preview', 'directory', 'group-detail', groupId] as const,
    groupCharacters: (groupId: string | null, excludeProfileId?: string | null) =>
      ['preview', 'directory', 'group-characters', groupId, excludeProfileId ?? null] as const,
    services: (game: PoeGame | null, league: string | null, serviceType: string | null) =>
      ['preview', 'services', game, league, serviceType] as const,
    guestAnalysisCharacters: (accountName: string) =>
      ['preview', 'guest-analysis', 'characters', accountName] as const,
    guestAnalysisStatus: (runToken: string | null) =>
      ['preview', 'guest-analysis', 'status', runToken] as const,
    guestAnalysisResults: (runToken: string | null) =>
      ['preview', 'guest-analysis', 'results', runToken] as const,
  },

  services: {
    mine: (groupId: string | null) => ['services', 'mine', groupId] as const,
    single: (serviceId: string | null) => ['services', 'single', serviceId] as const,
    publicList: (groupId: string | null, serviceType: string | null) =>
      ['services', 'public-list', groupId, serviceType] as const,
  },

  economy: (groupId: string | null) => ['economy', groupId] as const,

  strategies: {
    root: ['strategies'] as const,
    all: (groupId: string | null) => ['strategies', groupId] as const,
    single: (strategyId: string) => ['strategy', strategyId] as const,
    publicList: (groupId: string | null) => ['public-strategies', groupId] as const,
    publicSingle: (groupId: string | null, strategyId: string | null) =>
      ['public-strategy', groupId, strategyId] as const,
    linkedSnapshotCount: (groupId: string | null, strategyId: string | null) =>
      ['strategy-linked-snapshot-count', groupId, strategyId] as const,
    linkedSnapshots: (groupId: string | null, strategyId: string | null) =>
      ['strategy-linked-snapshots', groupId, strategyId] as const,
    singleRoot: ['strategy'] as const,
    count: (groupId: string | null) => ['strategies', 'count', groupId] as const,
  },

  gear: {
    all: (groupId: string | null) => ['gear', groupId] as const,
    single: (suggestionId: string) => ['gear-suggestion', suggestionId] as const,
  },

  gearOptimizer: {
    root: ['gear-optimizer'] as const,
    buildTargets: (groupId: string | null, targetUserId: string | null) =>
      ['gear-optimizer', 'build-targets', groupId, targetUserId] as const,
    buildTarget: (buildTargetId: string | null) =>
      ['gear-optimizer', 'build-target', buildTargetId] as const,
    buildTargetStages: (buildTargetId: string | null) =>
      ['gear-optimizer', 'build-target-stages', buildTargetId] as const,
    analysisRuns: (groupId: string | null, targetUserId: string | null, buildTargetId: string | null) =>
      ['gear-optimizer', 'analysis-runs', groupId, targetUserId, buildTargetId] as const,
    myLatestRuns: (groupId: string | null, targetUserId: string | null) =>
      ['gear-optimizer', 'my-latest-runs', groupId, targetUserId] as const,
    recommendationPlans: (runId: string | null) =>
      ['gear-optimizer', 'recommendation-plans', runId] as const,
    partyBuildTargets: (groupId: string | null) =>
      ['gear-optimizer', 'party-build-targets', groupId] as const,
    runtimeEstimate: (analysisMode: string | null) =>
      ['gear-optimizer', 'runtime-estimate', analysisMode ?? 'any'] as const,
  },

  ninja: {
    prices: (game: PoeGame | null, league: string | null) => ['ninja-divine', game, league] as const,
    threads: (game: PoeGame | null, league: string | null) =>
      ['ninja-threads', game, league] as const,
    scarabs: (game: PoeGame | null, league: string | null) =>
      ['ninja-scarabs', game, league] as const,
    gemIcons: ['poedb-gem-icons'] as const,
  },

  poe: {
    leagues: (game: PoeGame, source: 'account' | 'public') => ['poe-leagues', game, source] as const,
  },

  poeWiki: {
    inventoryIcon: (baseType: string | null) => ['poe-wiki', 'inventory-icon', baseType] as const,
  },

  ninjaItems: (game: PoeGame | null) => ['ninja-items', game] as const,
} as const
