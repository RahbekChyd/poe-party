export function createSupabaseRestClient({ url, adminKey }) {
  if (!url || !adminKey) {
    throw new Error('Missing Supabase URL or admin key')
  }

  const baseUrl = url.replace(/\/$/, '')

  function headers(extra = {}) {
    return {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      ...extra,
    }
  }

  async function request(path, init = {}) {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: headers(init.headers),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Supabase request failed (${response.status}) ${path}: ${text}`)
    }

    if (response.status === 204) return null
    return response.json()
  }

  function buildFilterParams(filters = {}) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value == null) continue
      params.set(key, `eq.${value}`)
    }
    return params
  }

  async function selectSingle(table, filters, select = '*') {
    const params = buildFilterParams(filters)
    params.set('select', select)
    const rows = await request(`${table}?${params.toString()}`)
    return Array.isArray(rows) ? (rows[0] ?? null) : rows
  }

  async function selectMany(
    table,
    filters,
    select = '*',
    { orderBy, ascending = false, limit } = {},
  ) {
    const params = buildFilterParams(filters)
    params.set('select', select)
    if (orderBy) params.set('order', `${orderBy}.${ascending ? 'asc' : 'desc'}`)
    if (Number.isFinite(limit) && limit > 0) params.set('limit', String(limit))
    const rows = await request(`${table}?${params.toString()}`)
    return Array.isArray(rows) ? rows : []
  }

  async function updateRows(table, filters, payload, { returning = 'representation' } = {}) {
    const params = buildFilterParams(filters)
    if (returning === 'representation') {
      params.set('select', '*')
    }
    const rows = await request(`${table}?${params.toString()}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Prefer: returning === 'minimal' ? 'return=minimal' : 'return=representation',
      },
      body: JSON.stringify(payload),
    })
    return Array.isArray(rows) ? rows : []
  }

  async function insertRow(table, payload) {
    const rows = await request(table, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    })
    return Array.isArray(rows) ? (rows[0] ?? null) : rows
  }

  async function deleteRows(table, filters) {
    const params = buildFilterParams(filters)
    await request(`${table}?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
    })
  }

  return {
    request,
    selectSingle,
    selectMany,
    updateRows,
    insertRow,
    deleteRows,
  }
}
