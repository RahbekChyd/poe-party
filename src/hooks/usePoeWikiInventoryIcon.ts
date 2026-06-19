import { useQuery } from '@tanstack/react-query'
import { fetchPoeWikiInventoryIconUrl } from '../lib/poe-wiki-icons'
import { queryKeys } from '../lib/queryKeys'

export function usePoeWikiInventoryIcon(
  baseType: string | null | undefined,
  enabled: boolean = true,
) {
  const normalizedBaseType = baseType?.replace(/\s+/g, ' ').trim() || null

  return useQuery({
    queryKey: queryKeys.poeWiki.inventoryIcon(normalizedBaseType),
    enabled: enabled && !!normalizedBaseType,
    staleTime: 1000 * 60 * 60 * 24 * 7,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    queryFn: () => fetchPoeWikiInventoryIconUrl(normalizedBaseType),
  })
}
