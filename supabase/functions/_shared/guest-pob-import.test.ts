import {
  buildGuestTargetStage,
  GuestPoePublicError,
  parseGuestPobImport,
} from './guest-analysis.ts'

const exportXml = `<PathOfBuilding>
  <Build className="Witch" />
  <Tree activeSpec="2">
    <Spec title="Progression" nodes="100" />
    <Spec title="Progression" nodes="200" specId="mapping" />
    <Spec title="Boss tree" nodes="300" />
  </Tree>
  <Items activeItemSet="8"><ItemSet id="4" title="Early gear" /><ItemSet id="8" title="Mapping gear" /></Items>
  <Skills activeSkillSet="9"><SkillSet id="3" title="Leveling links" /><SkillSet id="9" title="Fireball links" /></Skills>
  <Config activeConfigSet="6"><ConfigSet id="2" title="Campaign" /><ConfigSet id="6" title="Maps" /></Config>
</PathOfBuilding>`

function assertEqual(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

Deno.test('guest queue resolves the four active export layouts', async () => {
  const stream = new Blob([exportXml]).stream().pipeThrough(new CompressionStream('deflate'))
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
  const shareCode = btoa(String.fromCharCode(...compressed))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  const { metadata } = await parseGuestPobImport(shareCode)
  const stage = buildGuestTargetStage(metadata, {})
  assertEqual(
    [stage.tree_spec_id, stage.item_set_id, stage.skill_set_id, stage.config_set_id],
    ['tree-spec:2', '8', '9', '6'],
  )
  assertEqual(
    metadata.tree_specs.map(({ id, hashes }) => [id, hashes]),
    [
      ['tree-spec:1', [100]],
      ['tree-spec:2', [200]],
      ['tree-spec:3', [300]],
    ],
  )
})

Deno.test('guest queue preserves explicit positions and accepts legacy tree IDs', async () => {
  const { metadata } = await parseGuestPobImport(exportXml)
  for (const [requested, expected] of [
    ['tree-spec:1', 'tree-spec:1'],
    ['tree-spec:2', 'tree-spec:2'],
    ['Progression', 'tree-spec:1'],
    ['mapping', 'tree-spec:2'],
    ['Boss tree', 'tree-spec:3'],
    ['3', 'tree-spec:3'],
    ['unknown', 'tree-spec:2'],
  ]) {
    const stage = buildGuestTargetStage(metadata, {
      tree_spec_id: requested,
      item_set_id: '4',
      skill_set_id: '3',
      config_set_id: '2',
    })
    assertEqual(
      [stage.tree_spec_id, stage.item_set_id, stage.skill_set_id, stage.config_set_id],
      [expected, '4', '3', '2'],
    )
  }
})

Deno.test('guest queue keeps layouts absent from the export on PoB defaults', async () => {
  const { metadata } = await parseGuestPobImport(
    '<PathOfBuilding><Build /><Spec nodes="200" /><Config><Input name="test" /></Config></PathOfBuilding>',
  )
  const stage = buildGuestTargetStage(metadata, {})
  assertEqual(
    [stage.tree_spec_id, stage.item_set_id, stage.skill_set_id, stage.config_set_id],
    ['tree-spec:1', null, null, null],
  )
})

Deno.test('guest queue rejects malformed XML, unrelated XML and invalid share codes', async () => {
  for (const input of [
    '<PathOfBuilding><Build></PathOfBuilding>',
    '<AnotherExport><Build /></AnotherExport>',
    'invalid share code',
  ]) {
    try {
      await parseGuestPobImport(input)
      throw new Error('The guest parser accepted an invalid import')
    } catch (error) {
      if (!(error instanceof GuestPoePublicError)) throw error
      assertEqual([error.status, error.code], [400, 'invalid_pob'])
    }
  }
})
