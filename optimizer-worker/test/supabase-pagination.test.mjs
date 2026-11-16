import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupabaseRestClient } from '../src/lib/supabase.mjs'

function makeRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(4, '0'),
    value: index,
  }))
}

test('selectAllPages reads deterministic 500-row keyset pages', async (t) => {
  const sourceRows = makeRows(750)
  const requestedUrls = []
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    requestedUrls.push(url)
    const cursorFilter = url.searchParams.get('id')
    const cursor = cursorFilter?.startsWith('gt.') ? cursorFilter.slice(3) : null
    const page = sourceRows.filter((row) => cursor == null || row.id > cursor).slice(0, 500)
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const client = createSupabaseRestClient({
    url: 'https://supabase.example.invalid',
    adminKey: 'service-key',
  })
  const rows = await client.selectAllPages(
    'latest_stash_items',
    { group_id: 'group-a' },
    'id,value',
    { orderBy: 'id', ascending: true, maxRows: 1000 },
  )

  assert.equal(rows.length, 750)
  assert.equal(requestedUrls.length, 2)
  assert.equal(requestedUrls[0].searchParams.get('limit'), '500')
  assert.equal(requestedUrls[0].searchParams.get('order'), 'id.asc')
  assert.equal(requestedUrls[1].searchParams.get('id'), 'gt.0499')
})

test('selectAllPages fails instead of silently truncating at the configured bound', async (t) => {
  const sourceRows = makeRows(750)
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    const cursorFilter = url.searchParams.get('id')
    const cursor = cursorFilter?.startsWith('gt.') ? cursorFilter.slice(3) : null
    const page = sourceRows.filter((row) => cursor == null || row.id > cursor).slice(0, 500)
    return new Response(JSON.stringify(page), { status: 200 })
  }

  const client = createSupabaseRestClient({
    url: 'https://supabase.example.invalid',
    adminKey: 'service-key',
  })
  await assert.rejects(
    () =>
      client.selectAllPages('latest_stash_items', {}, 'id', {
        orderBy: 'id',
        maxRows: 500,
      }),
    /exceeded the configured 500-row limit/,
  )
})
