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
      if (typeof value === 'object' && !Array.isArray(value)) {
        const operator = value.operator
        if (!['eq', 'gt', 'gte', 'lt', 'lte'].includes(operator)) {
          throw new Error(`Unsupported Supabase filter operator for ${key}`)
        }
        params.set(key, `${operator}.${value.value}`)
      } else {
        params.set(key, `eq.${value}`)
      }
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

  async function selectAllPages(
    table,
    filters,
    select = '*',
    { orderBy = 'id', ascending = true, maxRows = 100000 } = {},
  ) {
    if (!Number.isSafeInteger(maxRows) || maxRows <= 0) {
      throw new Error('selectAllPages maxRows must be a positive integer')
    }

    const pageSize = 500
    const rows = []
    let cursor = null

    while (true) {
      const pageFilters = cursor
        ? {
            ...filters,
            [orderBy]: { operator: ascending ? 'gt' : 'lt', value: cursor },
          }
        : filters
      const page = await selectMany(table, pageFilters, select, {
        orderBy,
        ascending,
        limit: pageSize,
      })

      if (rows.length + page.length > maxRows) {
        throw new Error(`Supabase ${table} query exceeded the configured ${maxRows}-row limit`)
      }

      rows.push(...page)
      if (page.length < pageSize) return rows

      const nextCursor = page[page.length - 1]?.[orderBy]
      if (nextCursor == null || nextCursor === cursor) {
        throw new Error(`Supabase ${table} pagination did not advance on ${orderBy}`)
      }
      cursor = nextCursor
    }
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

  async function rpc(functionName, payload = {}) {
    return request(`rpc/${encodeURIComponent(functionName)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  return {
    request,
    selectSingle,
    selectMany,
    selectAllPages,
    updateRows,
    insertRow,
    deleteRows,
    rpc,
  }
}
