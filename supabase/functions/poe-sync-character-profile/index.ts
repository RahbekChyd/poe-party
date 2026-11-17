import { createAdminClient } from '../_shared/supabase-admin.ts'
import {
  PoeApiClient,
  type PoeCharacter,
  type PoeCharacterDetail,
  type PoeItem,
  type PoeLeagueAccount,
} from '../_shared/poe-api-client.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ensureFreshPoeAccessToken } from '../_shared/poe-token-store.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'
import { normalizeCharacterClassInfo } from '../_shared/poe-character-class.ts'
import { getPoeRealm, normalizePoeGame } from '../_shared/poe-game.ts'
import { normalizePoeItemModLines, getPoeItemModLinesByFlag } from '../_shared/poe-item-mods.ts'

const EQUIPMENT_SLOTS = new Set([
  'VisceraHead', 'VisceraBody', 'VisceraArm', 'VisceraLeg',
  'VisceraHead', 'VisceraBody', 'VisceraArm', 'VisceraLeg',
  'Helm',
  'Amulet',
  'BodyArmour',
  'Weapon',
  'Offhand',
  'Gloves',
  'Ring',
  'Ring2',
  'Belt',
  'Boots',
  'Weapon2',
  'Offhand2',
])

const JEWEL_SLOT_MARKERS = ['Passive', 'Jewel']
const INVENTORY_SLOT_MARKERS = ['MainInventory', 'Flask', 'Map', 'Sanctum', 'Relic']
const CLASS_IDS: Record<string, number> = {
  Scion: 0,
  Marauder: 1,
  Ranger: 2,
  Witch: 3,
  Duelist: 4,
  Templar: 5,
  Shadow: 6,
}
const EQUIPMENT_SLOT_SORT_ORDER = new Map([
  ['Helm', 0],
  ['Weapon', 1],
  ['Amulet', 2],
  ['Offhand', 3],
  ['Gloves', 4],
  ['BodyArmour', 5],
  ['Ring', 6],
  ['Belt', 7],
  ['Ring2', 8],
  ['Boots', 9],
  ['Weapon2', 10],
  ['Offhand2', 11],
])

function compareNullableStrings(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? '').localeCompare(b ?? '')
}

function compareNullableNumbers(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

function sortNumberArray(values: number[]) {
  return [...values].sort((a, b) => a - b)
}

function sortStringArray(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function compareEmbeddedGems(
  a: {
    id: string | null
    name: string
    typeLine: string
    support: boolean
    level: number | null
    quality: string | null
  },
  b: {
    id: string | null
    name: string
    typeLine: string
    support: boolean
    level: number | null
    quality: string | null
  },
) {
  return (
    compareNullableStrings(a.id, b.id) ||
    compareNullableStrings(a.name, b.name) ||
    compareNullableStrings(a.typeLine, b.typeLine) ||
    Number(a.support) - Number(b.support) ||
    compareNullableNumbers(a.level, b.level) ||
    compareNullableStrings(a.quality, b.quality)
  )
}

function compareProfileItems(
  a: {
    slot: string | null
    id: string | null
    name: string
    typeLine: string
    itemLevel: number | null
  },
  b: {
    slot: string | null
    id: string | null
    name: string
    typeLine: string
    itemLevel: number | null
  },
) {
  const slotRankA = a.slot ? (EQUIPMENT_SLOT_SORT_ORDER.get(a.slot) ?? 99) : 99
  const slotRankB = b.slot ? (EQUIPMENT_SLOT_SORT_ORDER.get(b.slot) ?? 99) : 99

  return (
    slotRankA - slotRankB ||
    compareNullableStrings(a.slot, b.slot) ||
    compareNullableStrings(a.id, b.id) ||
    compareNullableStrings(a.name, b.name) ||
    compareNullableStrings(a.typeLine, b.typeLine) ||
    compareNullableNumbers(a.itemLevel, b.itemLevel)
  )
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function normalizeLookupValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function findMatchingCharacter(
  characters: PoeCharacter[],
  storedCharacter: {
    poe_character_id?: string | null
    name?: string | null
  },
) {
  const storedPoeCharacterId = normalizeLookupValue(storedCharacter.poe_character_id)
  if (storedPoeCharacterId) {
    const matchedById =
      characters.find((character) => normalizeLookupValue(character.id) === storedPoeCharacterId) ??
      null
    if (matchedById) return matchedById
  }

  const storedName = normalizeLookupValue(storedCharacter.name)
  if (!storedName) return null

  return characters.find((character) => normalizeLookupValue(character.name) === storedName) ?? null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function readNumberArray(record: Record<string, unknown>, ...keys: string[]): number[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value
        .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
    }
  }
  return []
}

function packMasteryEffectPairs(record: Record<string, unknown>, ...keys: string[]): number[] {
  for (const key of keys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>)
        .map(([nodeHash, effectHash]) => {
          const node = Number(nodeHash)
          const effect = typeof effectHash === 'number' ? effectHash : Number(effectHash)
          if (!Number.isFinite(node) || !Number.isFinite(effect)) return null
          return (((effect & 0xffff) << 16) | (node & 0xffff)) >>> 0
        })
        .filter((entry): entry is number => entry != null)
    }
  }
  return []
}

function readNumericRecordKeys(record: Record<string, unknown>): number[] {
  return Object.keys(record)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
}

function normalizePassiveTreeJewelData(
  characterRecord: Record<string, unknown>,
  passives: Record<string, unknown>,
) {
  const topLevelSnake = asRecord(characterRecord.jewel_data)
  const topLevelCamel = asRecord(characterRecord.jewelData)
  const nestedSnake = asRecord(passives.jewel_data)
  const nestedCamel = asRecord(passives.jewelData)
  const jewelData =
    Object.keys(topLevelSnake).length > 0
      ? topLevelSnake
      : Object.keys(topLevelCamel).length > 0
        ? topLevelCamel
        : Object.keys(nestedSnake).length > 0
          ? nestedSnake
          : nestedCamel

  return Object.entries(jewelData)
    .map(([socketIndex, entry]) => {
      const normalizedEntry = asRecord(entry)
      const subgraph = asRecord(normalizedEntry.subgraph)
      return {
        socketIndex: Number.isFinite(Number(socketIndex)) ? Number(socketIndex) : null,
        type: readString(normalizedEntry, 'type'),
        radius: readNumber(normalizedEntry, 'radius'),
        radiusMin: readNumber(normalizedEntry, 'radiusMin'),
        radiusVisual: readString(normalizedEntry, 'radiusVisual'),
        subgraphNodeIds: readNumericRecordKeys(asRecord(subgraph.nodes)),
        subgraphGroupIds: readNumericRecordKeys(asRecord(subgraph.groups)),
      }
    })
    .sort((left, right) => {
      const leftValue = left.socketIndex ?? Number.MAX_SAFE_INTEGER
      const rightValue = right.socketIndex ?? Number.MAX_SAFE_INTEGER
      return leftValue - rightValue
    })
}

function normalizeModifierLines(lines: unknown): string[] {
  return normalizePoeItemModLines(lines)
}

function mapVeiledMods(item: PoeItem): string[] {
  return normalizeModifierLines(item.veiledMods).map((mod) => {
    if (mod.startsWith('Prefix')) return 'Veiled Prefix'
    if (mod.startsWith('Suffix')) return 'Veiled Suffix'
    return 'Veiled Modifier'
  })
}

function collectModifierLines(item: PoeItem): string[] {
  return [
    ...normalizeModifierLines(item.enchantMods),
    ...normalizeModifierLines(item.implicitMods),
    ...normalizeModifierLines(item.fracturedMods),
    ...normalizeModifierLines(item.explicitMods),
    ...normalizeModifierLines(item.craftedMods),
    ...mapVeiledMods(item),
    ...normalizeModifierLines(item.scourgeMods),
  ].slice(0, 8)
}

function mapProperty(property: { name: string; values?: [string, number][] }) {
  return {
    name: property.name,
    values: (property.values ?? []).map(([value]) => value),
  }
}

function mapSockets(item: PoeItem) {
  return (item.sockets ?? []).map((socket) => ({
    group: socket.group,
    color: socket.sColour ?? socket.attr ?? null,
  }))
}

function findPropertyValue(item: PoeItem, name: string): string | null {
  const match = (item.properties ?? []).find((property) => property.name === name)
  return match?.values?.[0]?.[0] ?? null
}

function mapSocketedItems(item: PoeItem) {
  return (item.socketedItems ?? [])
    .map((socketedItem) => ({
      id: socketedItem.id ?? null,
      name: socketedItem.name ?? '',
      typeLine: socketedItem.typeLine ?? '',
      icon: socketedItem.icon ?? null,
      support: !!socketedItem.support,
      level: Number(findPropertyValue(socketedItem, 'Level')) || null,
      quality: findPropertyValue(socketedItem, 'Quality'),
    }))
    .sort(compareEmbeddedGems)
}

function mapItem(item: PoeItem) {
  return {
    id: item.id ?? null,
    slot: item.inventoryId ?? null,
    name: item.name ?? '',
    typeLine: item.typeLine ?? '',
    baseType: item.baseType ?? null,
    icon: item.icon ?? null,
    rarity: item.rarity ?? null,
    frameType: typeof item.frameType === 'number' ? item.frameType : null,
    itemLevel: typeof item.itemLevel === 'number' ? item.itemLevel : null,
    identified: !!item.identified,
    corrupted: !!item.corrupted,
    fractured: !!item.fractured,
    synthesised: !!item.synthesised,
    veiled: !!item.veiled || (item.veiledMods?.length ?? 0) > 0,
    influences: sortStringArray(
      Object.entries(item.influences ?? {})
        .filter(([, active]) => !!active)
        .map(([name]) => name),
    ),
    note: item.note ?? null,
    width: item.w ?? null,
    height: item.h ?? null,
    sockets: mapSockets(item),
    socketedItems: mapSocketedItems(item),
    properties: (item.properties ?? []).map(mapProperty).slice(0, 5),
    requirements: (item.requirements ?? []).map(mapProperty).slice(0, 4),
    implicitMods: normalizeModifierLines(item.implicitMods),
    explicitMods: normalizeModifierLines(item.explicitMods?.filter((mod) => typeof mod === 'string' || (!mod.flags?.crafted && !mod.flags?.fractured))),
    craftedMods: [...normalizeModifierLines(item.craftedMods), ...getPoeItemModLinesByFlag(item.explicitMods, 'crafted')],
    fracturedMods: [...normalizeModifierLines(item.fracturedMods), ...getPoeItemModLinesByFlag(item.explicitMods, 'fractured')],
    enchantMods: normalizeModifierLines(item.enchantMods),
    veiledMods: mapVeiledMods(item),
    modifiers: collectModifierLines(item),
  }
}

function extractItems(character: PoeCharacterDetail): PoeItem[] {
  const candidateArrays = [
    character.items,
    character.equipment,
    character.inventory,
    character.jewels,
    character.wickerman,
  ]
  const itemMap = new Map<string, PoeItem>()

  for (const candidate of candidateArrays) {
    for (const item of candidate ?? []) {
      const key = item.id ?? `${item.inventoryId ?? 'unknown'}:${item.name}:${item.typeLine}`
      if (!itemMap.has(key)) itemMap.set(key, item)
    }
  }

  return [...itemMap.values()]
}

function normalizeItemGroups(character: PoeCharacterDetail) {
  const gear = []
  const inventory = []
  const jewels = []

  for (const item of extractItems(character)) {
    const slot = item.inventoryId ?? ''
    const normalized = mapItem(item)

    if (slot && EQUIPMENT_SLOTS.has(slot)) {
      gear.push(normalized)
      continue
    }

    if (JEWEL_SLOT_MARKERS.some((marker) => slot.includes(marker))) {
      jewels.push(normalized)
      continue
    }

    if (!slot || INVENTORY_SLOT_MARKERS.some((marker) => slot.includes(marker))) {
      inventory.push(normalized)
      continue
    }

    inventory.push(normalized)
  }

  return {
    gear: [...gear].sort(compareProfileItems),
    inventory: [...inventory].sort(compareProfileItems),
    jewels: [...jewels].sort(compareProfileItems),
  }
}

function normalizePassiveTree(
  character: PoeCharacterDetail,
  activeCharacter: Record<string, unknown>,
  activeCharacterClass: string | null,
) {
  const characterRecord: Record<string, unknown> = { ...character }
  const passives = asRecord(characterRecord.passives)
  const metadata = asRecord(characterRecord.metadata)
  const passivesHashes = readNumberArray(passives, 'hashes', 'passiveSkills')
  const passivesHashesEx = readNumberArray(passives, 'hashes_ex', 'hashesEx')
  const recordMasteryPairs = readNumberArray(
    characterRecord,
    'mastery_effect_pairs',
    'masteryEffectPairs',
    'masteryEffects',
  )
  const passivesMasteryPairs = readNumberArray(
    passives,
    'mastery_effect_pairs',
    'masteryEffectPairs',
  )
  return {
    url: readString(
      characterRecord,
      'passive_tree_url',
      'passiveTreeUrl',
      'passive_skill_tree_url',
      'url',
    ),
    version:
      readString(metadata, 'version') ??
      readString(characterRecord, 'version', 'treeVersion', 'gameVersion'),
    hashes: sortNumberArray(
      passivesHashes.length > 0
        ? passivesHashes
        : readNumberArray(characterRecord, 'hashes', 'passiveSkills'),
    ),
    hashesEx: sortNumberArray(
      passivesHashesEx.length > 0
        ? passivesHashesEx
        : readNumberArray(characterRecord, 'hashes_ex', 'hashesEx'),
    ),
    masteryEffects: sortNumberArray(
      recordMasteryPairs.length > 0
        ? recordMasteryPairs
        : passivesMasteryPairs.length > 0
          ? passivesMasteryPairs
          : [
              ...packMasteryEffectPairs(characterRecord, 'mastery_effects', 'masteryEffects'),
              ...packMasteryEffectPairs(passives, 'mastery_effects', 'masteryEffects'),
            ],
    ),
    jewelData: normalizePassiveTreeJewelData(characterRecord, passives),
    classId:
      readNumber(characterRecord, 'classId', 'class_id') ??
      (activeCharacterClass ? (CLASS_IDS[activeCharacterClass] ?? null) : null),
    ascendancyId:
      readNumber(characterRecord, 'ascendancyClass', 'ascendancy_class') ??
      readNumber(activeCharacter, 'ascendancy_class'),
  }
}

function normalizeAtlasTree(leagueAccount: PoeLeagueAccount, league: string | null) {
  const record = leagueAccount as Record<string, unknown>
  const atlasPassives = asRecord(record.atlas_passives)
  const atlasPassiveTrees = Array.isArray(record.atlas_passive_trees)
    ? record.atlas_passive_trees
    : []
  const firstAtlasTree =
    atlasPassiveTrees.find(
      (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
    ) ?? null

  return {
    url: readString(record, 'atlas_tree_url', 'atlas_skill_tree_url', 'atlasSkillTreeUrl'),
    hashes: sortNumberArray(
      readNumberArray(atlasPassives, 'hashes').length > 0
        ? readNumberArray(atlasPassives, 'hashes')
        : firstAtlasTree
          ? readNumberArray(asRecord(firstAtlasTree), 'hashes')
          : readNumberArray(
              record,
              'atlas_passive_hashes',
              'atlasPassiveHashes',
              'atlas_passive_skills',
              'atlasPassiveSkills',
            ),
    ),
    league,
  }
}

function emptyAtlasTree(league: string | null) {
  return {
    url: null,
    hashes: [] as number[],
    league,
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const { group_id, character_id } = (await req.json()) as {
      group_id?: string
      character_id?: string | null
    }
    if (!group_id) {
      return new Response(JSON.stringify({ error: 'Missing group_id parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const [{ data: groupData, error: groupError }, { data: membership, error: membershipError }] =
      await Promise.all([
        adminClient.from('groups').select('game, league').eq('id', group_id).single(),
        adminClient
          .from('group_members')
          .select('role')
          .eq('group_id', group_id)
          .eq('user_id', authenticatedUser.id)
          .maybeSingle(),
      ])

    if (groupError) throw groupError
    if (membershipError) throw membershipError
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this group' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const game = normalizePoeGame(groupData?.game)
    const groupLeague = typeof groupData?.league === 'string' ? groupData.league : ''
    let characterQuery = adminClient
      .from('characters')
      .select(
        'id, user_id, group_id, poe_character_id, name, league, class, ascendancy_class, level, experience, is_active, raw_data',
      )
      .eq('group_id', group_id)
      .eq('user_id', authenticatedUser.id)
    if (typeof character_id === 'string' && character_id.trim()) {
      characterQuery = characterQuery.eq('id', character_id.trim())
    } else {
      characterQuery = characterQuery.eq('is_active', true)
    }

    const { data: activeCharacter, error: activeCharacterError } =
      await characterQuery.maybeSingle()

    if (activeCharacterError) throw activeCharacterError

    if (!activeCharacter) {
      if (typeof character_id === 'string' && character_id.trim()) {
        return new Response(
          JSON.stringify({ skipped: true, reason: 'selected-character-not-found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
      return new Response(JSON.stringify({ skipped: true, reason: 'no-active-character' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: existingProfile } = await adminClient
      .from('character_profile_snapshots')
      .select('visibility')
      .eq('user_id', authenticatedUser.id)
      .eq('group_id', group_id)
      .eq('character_id', activeCharacter.id)
      .maybeSingle()

    const accessToken = await ensureFreshPoeAccessToken(authenticatedUser.id)
    const poeClient = new PoeApiClient(accessToken)
    const realm = getPoeRealm(game)
    const { characters } = await poeClient.getCharacters(realm)
    const latestCharacter = findMatchingCharacter(characters, activeCharacter)

    if (!latestCharacter) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: 'character-not-found-upstream',
          character_name: activeCharacter.name,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const normalizedLatestCharacter = normalizeCharacterClassInfo(
      game,
      latestCharacter.class,
      latestCharacter.ascendancyClass ?? 0,
    )
    const resolvedLeague = latestCharacter.league ?? activeCharacter.league
    if (!resolvedLeague || resolvedLeague !== groupLeague) {
      return new Response(JSON.stringify({ skipped: true, reason: 'character-league-mismatch' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const refreshedCharacter = {
      ...activeCharacter,
      poe_character_id: latestCharacter.id,
      name: latestCharacter.name,
      league: resolvedLeague,
      class: normalizedLatestCharacter.className,
      ascendancy_class: normalizedLatestCharacter.ascendancyClass,
      level: latestCharacter.level,
      experience: latestCharacter.experience,
      is_active: latestCharacter.current ?? activeCharacter.is_active,
      raw_data: latestCharacter,
    }

    const { error: refreshCharacterError } = await adminClient
      .from('characters')
      .update({
        poe_character_id: refreshedCharacter.poe_character_id,
        name: refreshedCharacter.name,
        league: refreshedCharacter.league,
        class: refreshedCharacter.class,
        ascendancy_class: refreshedCharacter.ascendancy_class,
        level: refreshedCharacter.level,
        experience: refreshedCharacter.experience,
        is_active: refreshedCharacter.is_active,
        raw_data: refreshedCharacter.raw_data,
        snapshotted_at: new Date().toISOString(),
      })
      .eq('id', activeCharacter.id)
      .eq('group_id', group_id)
      .eq('user_id', authenticatedUser.id)

    if (refreshCharacterError) throw refreshCharacterError

    const [{ character }, leagueAccountResponse] = await Promise.all([
      poeClient.getCharacter(refreshedCharacter.name, realm),
      game === 'poe1' && refreshedCharacter.league
        ? poeClient.getLeagueAccount(refreshedCharacter.league ?? '', realm)
        : Promise.resolve({ league_account: null }),
    ])
    const league_account = leagueAccountResponse?.league_account ?? null

    if (!character) {
      return new Response(JSON.stringify({ skipped: true, reason: 'character-not-found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const activeCharacterRecord = asRecord(refreshedCharacter.raw_data)
    const normalizedCharacter = normalizeCharacterClassInfo(
      game,
      refreshedCharacter.class ?? null,
      refreshedCharacter.ascendancy_class ?? 0,
    )
    const { gear, inventory, jewels } = normalizeItemGroups(character)
    const passiveTree = normalizePassiveTree(
      character,
      activeCharacterRecord,
      normalizedCharacter.className,
    )
    const atlasTree =
      game === 'poe1'
        ? normalizeAtlasTree(league_account ?? {}, refreshedCharacter.league ?? null)
        : emptyAtlasTree(refreshedCharacter.league ?? null)

    const { error: upsertError } = await adminClient.from('character_profile_snapshots').upsert(
      {
        user_id: authenticatedUser.id,
        group_id,
        character_id: activeCharacter.id,
        character_name: refreshedCharacter.name,
        league: refreshedCharacter.league,
        class: normalizedCharacter.className,
        ascendancy_class: normalizedCharacter.ascendancyClass,
        level: refreshedCharacter.level,
        visibility: existingProfile?.visibility === 'public' ? 'public' : 'group_only',
        gear,
        inventory,
        jewels,
        passive_tree: passiveTree,
        atlas_tree: atlasTree,
        raw_character: character,
        raw_league_account: game === 'poe1' ? (league_account ?? {}) : {},
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,group_id,character_id' },
    )

    if (upsertError) throw upsertError

    return new Response(
      JSON.stringify({
        synced: true,
        character_name: refreshedCharacter.name,
        gear_count: gear.length,
        inventory_count: inventory.length,
        jewel_count: jewels.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Character profile sync error:', error)
    return new Response(
      JSON.stringify({
        error: 'Character profile sync failed',
        detail: toErrorMessage(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
