import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCurrentImportPayload, collectOverlayImportItems, normalizeProfileSlot, collectOwnedVisceraCandidates } from '../src/lib/pob-payload.mjs'
import { toPobTextFromProfileItem } from '../src/lib/pob-item-text.mjs'
import { normalizeSlot } from '../src/lib/poe-trade-client.mjs'
import { resolveTargetContext } from '../src/lib/target-context.mjs'

const helm = { id: 'helm', inventoryId: 'Helm', name: '', typeLine: 'Iron Hat', frameType: 0, properties: [], explicitMods: [{ description: '+40 to maximum Life', flags: { fractured: true } }], socketedItems: [{ typeLine: 'Fireball', builtInSupport: 'Greater Multiple Projectiles' }] }
const head = { id: 'head', inventoryId: 'VisceraHead', name: '', typeLine: 'Test Head', implicitMods: [{ description: '10% increased Damage', flags: { rareonly: true } }] }

test('tree selection resolves source positions and legacy IDs before the saved title', () => {
  const treeSpecs = [
    { id: 'tree-spec:1', title: 'Duplicate' },
    { id: 'tree-spec:2', title: 'Duplicate', legacyId: 'legacy-second' },
  ]
  const buildTarget = { import_metadata: { tree_specs: treeSpecs } }
  for (const id of ['tree-spec:2', 'legacy-second', '2']) {
    const context = resolveTargetContext({
      buildTarget,
      targetStage: { tree_spec_id: id, tree_spec_title: 'Duplicate' },
    })
    assert.equal(context.selectedTreeSpec?.id, 'tree-spec:2')
  }
  assert.equal(resolveTargetContext({
    buildTarget,
    targetStage: { tree_spec_id: 'tree-spec:3', tree_spec_title: 'Duplicate' },
  }).selectedTreeSpec, null)
})

test('OAuth input preserves raw mods, passives, imbued skills and separate Wickerman slots', () => {
  const result = buildCurrentImportPayload({ raw_character: { name: 'Fixture', class: 'Witch', level: 90, equipment: [helm], wickerman: [head], guardian: [helm], passives: { hashes: [100], hashes_ex: [101], mastery_effects: { 1: 2 }, bandit_choice: 'Alira', pantheon_major: 'BrineKing', alternate_ascendancy: 1 } } })
  assert.equal(result.character.name, 'Fixture')
  assert.equal(result.character.equipment[0].id, helm.id)
  assert.equal(result.character.wickerman[0].id, head.id)
  assert.equal(result.character.equipment[0].socketedItems[0].builtInSupport, 'Greater Multiple Projectiles')
  assert.equal(result.character.passives.bandit_choice, 'Alira')
  assert.deepEqual(result.completeness, { equipment: true, passives: true, wickerman: true })
  assert.deepEqual(result.unsupported_flags, ['rareonly'])
})

test('legacy guest supplies identity and jewels without inventing Wickerman completeness', () => {
  const jewel = { id: 'jewel', inventoryId: 'PassiveJewels', x: 0 }
  const result = buildCurrentImportPayload({ raw_character: { character: { name: 'Legacy', class: 'Witch', level: 80 }, items: [helm], passives: { hashes: [100], items: [jewel] } } })
  assert.equal(result.character.name, 'Legacy')
  assert.equal(result.character.equipment[0].id, helm.id)
  assert.equal(result.character.jewels[0].id, jewel.id)
  assert.equal(result.completeness.wickerman, false)
  assert.deepEqual(result.character.wickerman, [])
})

test('guest can supply an explicit empty Wickerman or embedded parts', () => {
  assert.equal(buildCurrentImportPayload({ raw_character: { items: [], wickerman: [] } }).completeness.wickerman, true)
  const result = buildCurrentImportPayload({ raw_character: { items: [helm, head] } })
  assert.equal(result.character.wickerman[0].id, head.id)
  assert.equal(result.character.equipment[0].id, helm.id)
})

test('overlay strips socket replacement and excludes unequipped inventory', () => {
  const overlay = collectOverlayImportItems({ raw_character: { equipment: [helm], wickerman: [head], inventory: [{ ...helm, id: 'bag', inventoryId: 'MainInventory' }] } })
  assert.equal(overlay.length, 2)
  assert.equal(overlay[0].socketedItems, undefined)
  assert.deepEqual(overlay[0].explicitMods, helm.explicitMods)
})

test('four Viscera slots remain distinct from helmet and body armour', () => {
  for (const part of ['Head', 'Body', 'Arm', 'Leg']) {
    assert.equal(normalizeProfileSlot('Viscera' + part), part)
    assert.equal(normalizeSlot(part), part)
    assert.equal(normalizeSlot('Viscera' + part), part)
  }
  assert.equal(normalizeSlot('Body Armour'), 'BodyArmour')
  assert.equal(normalizeSlot('Helmet'), 'Helmet')
})

test('structured modifier descriptions survive item text conversion', () => {
  const text = toPobTextFromProfileItem(helm)
  assert.match(text, /\+40 to maximum Life/)
  assert.doesNotMatch(text, /\[object Object\]/)
})


test('owned Viscera route to exact part swaps at zero purchase cost and retain owner identity', () => {
  const owned = [
    { id: 'stash-a', user_id: 'owner', base_type: 'Test Head', pob_item_text: 'Rarity: Normal\nTest Head', display_name: 'Test Head' },
    { id: 'stash-b', base_type: 'Other Head', pob_item_text: 'other' },
    { id: 'stash-c', base_type: 'Test Head', pob_item_text: 'excluded', is_excluded: true },
  ]
  const candidates = collectOwnedVisceraCandidates(owned, [{ slot: 'Head', type_line: 'Test Head' }, { slot: 'Helmet', type_line: 'Test Head' }])
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].slot, 'Head')
  assert.equal(candidates[0].chaosValue, 0)
  assert.equal(candidates[0].ownedItemId, 'stash-a')
  assert.equal(candidates[0].ownerUserId, 'owner')
  assert.equal(candidates[0].candidateSource, 'owned')
})
