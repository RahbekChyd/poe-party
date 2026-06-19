import type { PoeCharacter, PoeItem } from '../types/poe-api'
function poeFetch(path: string, sessId: string, cfClearance: string, init?: RequestInit) {
  return fetch(`/api/poe${path}`, {
    ...init,
    headers: {
      'X-POESESSID': sessId,
      'X-CF-CLEARANCE': cfClearance,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      ...init?.headers,
    },
  })
}

function formPost(path: string, sessId: string, cfClearance: string, params: Record<string, string>) {
  return poeFetch(path, sessId, cfClearance, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(params).toString(),
  })
}

async function assertOk(res: Response) {
  if (res.status === 403) {
    throw new Error(
      'Access denied (403). Your PoE profile may be private, or your session cookies may have expired.',
    )
  }
  if (!res.ok) throw new Error(`PoE API error: ${res.status} ${res.statusText}`)
}

export async function fetchPoeCharacters(
  accountName: string,
  sessId: string,
  cfClearance: string,
): Promise<PoeCharacter[]> {
  const res = await formPost('/character-window/get-characters', sessId, cfClearance, {
    accountName,
    realm: 'pc',
  })
  await assertOk(res)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('Unexpected response format from PoE API')
  return data as PoeCharacter[]
}

export async function fetchPoeCharacterItems(
  accountName: string,
  sessId: string,
  cfClearance: string,
  character: string,
): Promise<PoeItem[]> {
  const res = await formPost('/character-window/get-items', sessId, cfClearance, {
    accountName,
    realm: 'pc',
    character,
  })
  await assertOk(res)
  const data = await res.json() as { items?: PoeItem[] }
  return data.items ?? []
}

export async function fetchPoeCharacterPassiveTree(
  accountName: string,
  sessId: string,
  cfClearance: string,
  character: string,
): Promise<Record<string, unknown>> {
  const res = await formPost('/character-window/get-passive-skills', sessId, cfClearance, {
    accountName,
    realm: 'pc',
    character,
  })
  await assertOk(res)
  return await res.json() as Record<string, unknown>
}

export interface LegacyStashTab {
  n: string
  i: number
  id: string
  type: string
  colour: { r: number; g: number; b: number }
  hidden?: boolean
  selected?: boolean
}

export async function fetchPoeStashTabs(
  accountName: string,
  sessId: string,
  cfClearance: string,
  league: string,
): Promise<LegacyStashTab[]> {
  const res = await formPost('/character-window/get-stash-items', sessId, cfClearance, {
    accountName,
    realm: 'pc',
    league,
    tabs: '1',
    tabIndex: '0',
  })
  await assertOk(res)
  const data = (await res.json()) as { tabs?: LegacyStashTab[] }
  return data.tabs ?? []
}

export async function fetchPoeStashTabItems(
  accountName: string,
  sessId: string,
  cfClearance: string,
  league: string,
  tabIndex: number,
): Promise<PoeItem[]> {
  const res = await formPost('/character-window/get-stash-items', sessId, cfClearance, {
    accountName,
    realm: 'pc',
    league,
    tabs: '0',
    tabIndex: String(tabIndex),
  })
  await assertOk(res)
  const data = (await res.json()) as { items?: PoeItem[] }
  return data.items ?? []
}
