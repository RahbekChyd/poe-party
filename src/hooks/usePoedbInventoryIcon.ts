import { useQuery } from '@tanstack/react-query'
import { fetchPoedbInventoryIconUrl } from '../lib/poedb-item-client'
import { queryKeys } from '../lib/queryKeys'

export function usePoedbInventoryIcon(
  baseType: string | null | undefined,
  enabled: boolean = true,
) {
  const normalizedBaseType = baseType?.replace(/\s+/g, ' ').trim() || null

  return useQuery({
    queryKey: queryKeys.poedb.inventoryIcon(normalizedBaseType),
    enabled: enabled && !!normalizedBaseType,
    staleTime: 1000 * 60 * 60 * 24 * 7,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
    queryFn: () => fetchPoedbInventoryIconUrl(normalizedBaseType),
  })
}
