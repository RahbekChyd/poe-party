import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { buildPobRuntimePayload } from '../src/lib/pob-payload.mjs'

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
    raw_character: {
      name: 'Fixture',
      class: 'Witch',
      league: 'Covens',
      level: 90,
      equipment: [weapon],
      wickerman,
      passives: { hashes: [], hashes_ex: [], mastery_effects: {} },
    },
    gear: [],
    passive_tree: {},
  }
  const payload = buildPobRuntimePayload({
    run: { id: 'fixture', budget_chaos: 100 },
    buildTarget: { raw_xml: targetXml },
    profile,
    latestItems: options.latestItems ?? [],
    marketUniques: [],
    marketRares: options.marketRares ?? [],
    league: 'Covens',
    targetContext: options.targetContext ?? {},
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
    throw new Error(`PoB fixture failed (${result.status}): ${result.stderr}\n${result.stdout}`)
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
console.log(
  'PoB 3.30 real engine smoke passed: skill, structured Viscera modifier, empty-slot replacement, owned and market swaps.',
)
