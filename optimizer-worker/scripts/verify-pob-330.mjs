import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { buildPobRuntimePayload } from '../src/lib/pob-payload.mjs'
import { resolveTargetContext } from '../src/lib/target-context.mjs'

// Credential-free numerical smoke fixture. Run after docker build:
// node optimizer-worker/scripts/verify-pob-330.mjs [image]
const image = process.argv[2] ?? 'poe-optimizer-worker-330-verify'
const gem = {
  id: 'fixture-gem',
  socket: 0,
  name: '',
  typeLine: 'Fireball',
  baseType: 'Fireball',
  frameType: 4,
  support: false,
  properties: [
    { name: 'Level', values: [['20', 0]] },
    { name: 'Quality', values: [['0%', 0]] },
  ],
}
const weapon = {
  id: 'fixture-wand',
  inventoryId: 'Weapon',
  name: '',
  typeLine: 'Driftwood Wand',
  baseType: 'Driftwood Wand',
  frameType: 0,
  identified: true,
  itemLevel: 80,
  properties: [],
  requirements: [],
  implicitMods: [],
  explicitMods: [],
  sockets: [{ group: 0, attr: 'I' }],
  socketedItems: [gem],
}
const rawXml =
  '<PathOfBuilding><Build level="90" className="Witch" ascendClassName="None" mainSocketGroup="1"/><Tree activeSpec="1"><Spec treeVersion="3_30" classId="3" ascendClassId="0" nodes=""/></Tree><Skills activeSkillSet="1"><SkillSet id="1"><Skill enabled="true" slot="Weapon 1" mainActiveSkill="1"><Gem nameSpec="Fireball" skillId="Fireball" gemId="Metadata/Items/Gems/SkillGemFireball" level="20" quality="0" enabled="true"/></Skill></SkillSet></Skills></PathOfBuilding>'

function run(wickerman, targetXml = rawXml, options = {}) {
  const profile = {
    character_name: 'Fixture',
    class: 'Witch',
    league: 'Covens',
    level: 90,
    last_synced_at: '2026-11-23T10:00:00Z',
    raw_character: {
      name: 'Fixture',
      class: 'Witch',
      league: 'Covens',
      level: 90,
      equipment: [weapon],
      wickerman,
      passives: options.passives ?? { hashes: [], hashes_ex: [], mastery_effects: {} },
    },
    gear: [],
    passive_tree: {},
  }
  const buildTarget = { raw_xml: targetXml, import_metadata: options.importMetadata }
  const payload = buildPobRuntimePayload({
    run: {
      id: 'fixture',
      budget_chaos: 100,
      analysis_mode: options.analysisMode ?? 'quick',
      __run_type: options.runKind,
    },
    buildTarget,
    targetStage: options.targetStage,
    profile,
    latestItems: options.latestItems ?? [],
    marketUniques: [],
    marketRares: options.marketRares ?? [],
    league: 'Covens',
    targetContext:
      options.targetContext ?? resolveTargetContext({ buildTarget, targetStage: options.targetStage }),
    partyBuilds: [],
  })
  const result = spawnSync(
    'docker',
    ['run', '--rm', '-i', '--network=none', '--entrypoint', '/app/pob/run-pob-runtime.sh', image],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  if (result.status !== 0)
    throw new Error(`PoB fixture failed (${result.status}): ${result.error ?? ''}\n${result.stderr}\n${result.stdout}`)
  const output = JSON.parse(result.stdout)
  assert.notEqual(output.status, 'failed')
  assert.equal(output.summary.compare_power_report?.source, 'upstream_compare_power_report')
  assert.equal(output.summary.compare_power_report?.current_import?.imported_items, true)
  assert.equal(output.summary.compare_power_report?.current_import?.imported_tree, true)
  assert.equal(output.summary.pob_ref, 'a41fec6c20f822a658ae5df1273e8c69d5969bac')
  const metrics = output.summary.baseline_metrics ?? output.baseline_metrics
  assert.ok(
    metrics &&
      Object.values(metrics).some((value) => typeof value === 'number' && Number.isFinite(value)),
    'finite metrics required',
  )
  assert.ok(metrics.totalDps > 0, 'Fireball must be evaluated')
  console.log(
    JSON.stringify({
      status: output.status,
      life: metrics.life,
      totalDps: metrics.totalDps,
      wickerman_count: wickerman.length,
    }),
  )
  return output
}

// Ordinary rare equipment exercises PoB's weighted trade-query callback. Viscera
// fixtures alone do not cover this path because PoB cannot generate their queries.
const rawHelmet =
  'Rarity: Rare\nFixture Crown\nIron Hat\nItem Level: 80\nImplicits: 0\n+100 to maximum Life\n+30% to all Elemental Resistances\n40% increased Spell Damage'
const rare = run([], rawXml, {
  analysisMode: 'thorough',
  targetContext: {
    selectedItemSet: {
      id: 1,
      items: [{ slot: 'Helmet', typeLine: 'Iron Hat', rarity: 'Rare', rawText: rawHelmet }],
    },
  },
})
const rareItem = [...rare.plans, ...(rare.overview_plans ?? [])].flatMap((plan) => plan.items ?? []).find(
  (item) => item.slot === 'Helmet' && item.item_payload?.trade_link_kind === 'pob_weighted_query',
)
assert.ok(rareItem?.trade_link, 'rare equipment must produce a weighted trade link')
const tradeUrl = new URL(rareItem.trade_link)
assert.equal(tradeUrl.origin, 'https://www.pathofexile.com')
assert.equal(tradeUrl.pathname, '/trade/search/Covens')
const tradeBody = JSON.parse(tradeUrl.searchParams.get('q'))
assert.equal(tradeBody.query.status.option, 'online')
assert.equal(tradeBody.query.stats[0].type, 'weight')
assert.ok(tradeBody.query.stats[0].filters.length > 0, 'PoB stat weights must survive serialization')
assert.equal(tradeBody.query.filters.trade_filters.filters.price.max, 100)
assert.equal(tradeBody.query.filters.trade_filters.filters.price.option, 'chaos')
assert.deepEqual(tradeBody.sort, { 'statgroup.0': 'desc' })
assert.equal(tradeBody.engine, 'new')

const empty = run([])
// A controlled modifier on a real 3.30 Viscera base isolates slot import effects.
const head = {
  id: 'fixture-head',
  inventoryId: 'VisceraHead',
  name: '',
  typeLine: 'Severed Rhoa Head',
  baseType: 'Severed Rhoa Head',
  frameType: 15,
  identified: true,
  itemLevel: 80,
  properties: [],
  requirements: [],
  implicitMods: [{ description: '+100 to maximum Life' }],
  explicitMods: [],
}
const equipped = run([head])
assert.equal(equipped.summary.baseline_metrics.life - empty.summary.baseline_metrics.life, 100)
const targetWithHead = rawXml.replace(
  '</PathOfBuilding>',
  '<Items activeItemSet="1"><Item id="1">Rarity: Normal\nSevered Rhoa Head\nItem Level: 80\nImplicits: 1\n+100 to maximum Life</Item><ItemSet id="1"><Slot name="Head" itemId="1"/></ItemSet></Items></PathOfBuilding>',
)
const removed = run([], targetWithHead)
assert.equal(
  removed.summary.baseline_metrics.life,
  empty.summary.baseline_metrics.life,
  'missing current part must clear target gear',
)
const rawHead =
  'Rarity: Normal\nSevered Rhoa Head\nItem Level: 80\nImplicits: 1\n+100 to maximum Life'
const targetContext = {
  selectedItemSet: {
    id: 1,
    items: [{ slot: 'Head', typeLine: 'Severed Rhoa Head', rarity: 'Normal', rawText: rawHead }],
  },
}
const owned = run([], targetWithHead, {
  targetContext,
  latestItems: [
    {
      id: 'fixture-owned',
      user_id: 'fixture-user',
      frame_type: 15,
      name: '',
      type_line: 'Severed Rhoa Head',
      base_type: 'Severed Rhoa Head',
      raw_data: head,
      mods: { implicit: ['+100 to maximum Life'] },
    },
  ],
})
assert.ok(
  owned.plans.some((plan) =>
    plan.items?.some(
      (item) =>
        item.source === 'owned' &&
        item.effective_price_chaos === 0 &&
        item.item_payload.stash_item_id === 'fixture-owned',
    ),
  ),
  'owned part must produce a zero-purchase exact swap',
)
const market = run([], targetWithHead, {
  targetContext,
  marketRares: [
    {
      slot: 'Head',
      itemName: 'Severed Rhoa Head',
      baseType: 'Severed Rhoa Head',
      rawText: rawHead,
      chaosValue: 10,
      listingPriceAmount: 10,
      listingPriceCurrency: 'chaos',
    },
  ],
})
assert.ok(
  market.plans.some((plan) =>
    plan.items?.some((item) => item.source === 'market' && item.effective_price_chaos === 10),
  ),
  'market part must retain acquisition cost',
)
for (const [result, source] of [
  [owned, 'owned'],
  [market, 'market'],
]) {
  const swap = result.plans.find((plan) => plan.items?.some((item) => item.source === source))
  assert.equal(
    swap.after_metrics.life - swap.before_metrics.life,
    100,
    `${source} swap must calculate the exact life gain`,
  )
}

// These are the two Witch starting passives in the pinned 3.30 tree.
const currentNode = 60791
const targetNode = 57264
const passiveSpecXml = (nodeId) =>
  `<Spec title="Duplicate" treeVersion="3_30" classId="3" ascendClassId="0" clusterHashFormatVersion="2" nodes="${nodeId}"/>`
const originalSkillSet = rawXml.match(/<SkillSet.*?<\/SkillSet>/)[0]
const multiLayoutXml = rawXml
  .replace(/<Tree.*?<\/Tree>/, `<Tree activeSpec="2">${passiveSpecXml(currentNode)}${passiveSpecXml(targetNode)}</Tree>`)
  .replace(/<Skills.*?<\/Skills>/, `<Skills activeSkillSet="9">${originalSkillSet}${originalSkillSet.replace('id="1"', 'id="9"')}</Skills>`)
  .replace('</PathOfBuilding>', '<Items activeItemSet="8"><ItemSet id="1" title="Gear"/><ItemSet id="8" title="Gear"/></Items><Config activeConfigSet="7"><ConfigSet id="1" title="Config"/><ConfigSet id="7" title="Config"/></Config></PathOfBuilding>')

function assertResolvedLayout(summary, tree, gear, skill, config) {
  assert.deepEqual([
    summary.resolved_tree_spec_id,
    summary.resolved_item_set_id,
    summary.resolved_skill_set_id,
    summary.resolved_config_set_id,
  ], [tree, gear, skill, config])
}

const activeLayouts = run([], multiLayoutXml, {
  passives: { hashes: [currentNode, 65535], hashes_ex: [177777] },
})
assertResolvedLayout(activeLayouts.summary, 2, 8, 9, 7)
const comparison = activeLayouts.summary.passive_tree_comparison
assert.equal(comparison.version, 1)
assert.equal(comparison.current.tree_version, '3_30')
assert.equal(comparison.target.variant, 'standard')
assert.equal(comparison.current.synced_at, '2026-11-23T10:00:00Z')
assert.deepEqual(comparison.current.mastery_effects, {})
assert.ok(comparison.current.allocation_ids.includes(currentNode))
assert.ok(!comparison.current.allocation_ids.includes(targetNode))
assert.ok(comparison.target.allocation_ids.includes(targetNode))
assert.ok(!comparison.target.allocation_ids.includes(currentNode))
assert.deepEqual(comparison.current.unresolved_node_ids, [65535])
assert.equal(comparison.current.unresolved_cluster_count, 1)

const firstLayoutsXml = multiLayoutXml
  .replace('activeSpec="2"', 'activeSpec="1"')
  .replace('activeSkillSet="9"', 'activeSkillSet="1"')
  .replace('activeItemSet="8"', 'activeItemSet="1"')
  .replace('activeConfigSet="7"', 'activeConfigSet="1"')
const metadata = {
  tree_specs: [
    { id: 'Duplicate', title: 'Duplicate' },
    { id: 'Legacy name', title: 'Duplicate' },
  ],
  item_sets: [{ id: '1', title: 'Gear' }, { id: '8', title: 'Gear' }],
  skill_sets: [{ id: '1' }, { id: '9' }],
  config_sets: [{ id: '1', title: 'Config' }, { id: '7', title: 'Config' }],
}
const explicitLayouts = {
  tree_spec_id: 'tree-spec:2', tree_spec_title: 'Duplicate',
  item_set_id: '8', skill_set_id: '9', config_set_id: '7',
}
const guest = run([], firstLayoutsXml, {
  runKind: 'guest_upgrade_analysis',
  importMetadata: metadata,
  targetStage: explicitLayouts,
})
assertResolvedLayout(guest.summary, 2, 8, 9, 7)
assert.equal(guest.summary.passive_tree_comparison, undefined)

const legacy = run([], firstLayoutsXml, {
  importMetadata: metadata,
  targetStage: { ...explicitLayouts, tree_spec_id: 'Legacy name' },
})
assertResolvedLayout(legacy.summary, 2, 8, 9, 7)
assert.ok(legacy.summary.passive_tree_comparison.target.allocation_ids.includes(targetNode))

const missingTree = run([], multiLayoutXml, { passives: {} })
assert.equal(missingTree.summary.passive_tree_comparison, undefined)

// Both Caster Mastery wheels offer the same effect. Keep their selected node IDs
// distinct and preserve the target's actual cluster allocation and tattoo marker.
const currentMasteryPath = [57226, 21678, 32210, 8948, 27659, 37671, 12189, 5875, 9788, 40196]
const targetMasteryPath = [57264, 37569, 36542, 4397, 7938, 34157, 54657, 9432, 28680]
const targetClusterPath = [31875, 60398, 46340, 42760, 36678, 20987, 52502, 7960, 65568]
const clusterItem = 'Rarity: Magic\nLarge Cluster Jewel\nItem Level: 84\nImplicits: 0\n{enchant}Adds 8 Passive Skills\n{enchant}2 Added Passive Skills are Jewel Sockets\n{enchant}Added Small Passive Skills grant: 12% increased Chaos Damage'
const masteryTarget = rawXml
  .replace(/<Tree.*?<\/Tree>/, `<Tree activeSpec="1"><Spec treeVersion="3_30" classId="3" ascendClassId="0" clusterHashFormatVersion="2" nodes="${[...targetMasteryPath, ...targetClusterPath]}" masteryEffects="{28680,48358}"><Overrides><Override nodeId="37569" dn="Tattoo of the Hinekora Warrior"/></Overrides><Sockets><Socket nodeId="7960" itemId="1"/></Sockets></Spec></Tree>`)
  .replace('</PathOfBuilding>', `<Items activeItemSet="1"><Item id="1">${clusterItem}</Item></Items></PathOfBuilding>`)
const masteries = run([], masteryTarget, {
  passives: {
    hashes: currentMasteryPath,
    masteryEffects: [((48358 << 16) | 40196) >>> 0],
  },
})
const masteryComparison = masteries.summary.passive_tree_comparison
assert.deepEqual(masteryComparison.current.mastery_effects, { 40196: 48358 })
assert.deepEqual(masteryComparison.target.mastery_effects, { 28680: 48358 })
assert.deepEqual(masteryComparison.current.modified_nodes, [])
assert.deepEqual(masteryComparison.current.cluster_allocation_ids, [])
assert.deepEqual(masteryComparison.target.modified_nodes, [37569])
assert.deepEqual(masteryComparison.target.cluster_sockets, [{ node_id: 7960, name: 'Large Cluster Jewel' }])
assert.deepEqual(masteryComparison.target.cluster_allocation_ids, [65568])
assert.equal(masteryComparison.target.unresolved_cluster_count, 0)

console.log(
  'PoB 3.30 real engine smoke passed: trade links, Viscera swaps, layout selection, legacy targets, and signed-in passive tree capture.',
)
