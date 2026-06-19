import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import {
  buildDefaultDetails,
  normalizeServiceDetails,
  type ServiceAvailability,
  type ServiceDetails,
  type ServiceType,
  type ServiceVisibility,
} from '../lib/service-types'
import { normalizePublicServiceRow } from './useGuestServices'
const SERVICE_STALE_TIME = 30_000

export interface OwnedService {
  id: string
  group_id: string
  user_id: string
  service_type: ServiceType
  title: string
  description: string | null
  region: string | null
  price_divine: number | null
  price_min_divine: number | null
  price_max_divine: number | null
  poe_ign: string
  whisper_template: string | null
  availability: ServiceAvailability
  mod_exclusions: string[]
  details: ServiceDetails
  visibility: ServiceVisibility
  is_active: boolean
  created_at: string
  updated_at: string
}

function normalizeOwned(row: Record<string, unknown>): OwnedService {
  const serviceType = (row.service_type ?? 'boss_carry') as ServiceType
  const availability = (row.availability ?? 'available') as ServiceAvailability
  const visibility = (row.visibility ?? 'public') as ServiceVisibility
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    user_id: String(row.user_id),
    service_type: serviceType,
    title: String(row.title ?? 'Untitled service'),
    description: typeof row.description === 'string' ? row.description : null,
    region: typeof row.region === 'string' ? row.region : null,
    price_divine: row.price_divine == null ? null : Number(row.price_divine),
    price_min_divine: row.price_min_divine == null ? null : Number(row.price_min_divine),
    price_max_divine: row.price_max_divine == null ? null : Number(row.price_max_divine),
    poe_ign: String(row.poe_ign ?? ''),
    whisper_template: typeof row.whisper_template === 'string' ? row.whisper_template : null,
    availability,
    mod_exclusions: Array.isArray(row.mod_exclusions)
      ? row.mod_exclusions.filter((v): v is string => typeof v === 'string')
      : [],
    details: normalizeServiceDetails(serviceType, row.details),
    visibility,
    is_active: row.is_active !== false,
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }
}

function invalidateServiceCaches(
  queryClient: QueryClient,
  args: { groupId?: string; serviceId?: string },
) {
  if (args.groupId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.services.mine(args.groupId) })
  }
  if (args.serviceId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.services.single(args.serviceId) })
  }
  // Public list + preview list keys include game/league/type we don't know here;
  // match the prefix so every cached variant is refreshed.
  queryClient.invalidateQueries({ queryKey: ['services', 'public-list'] })
  queryClient.invalidateQueries({ queryKey: ['preview', 'services'] })
}

export function useMyServices(groupId: string | null) {
  return useQuery({
    queryKey: queryKeys.services.mine(groupId),
    enabled: !!groupId,
    staleTime: SERVICE_STALE_TIME,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('group_id', groupId!)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeOwned)
    },
  })
}

export function useOwnedService(serviceId: string | null) {
  return useQuery({
    queryKey: queryKeys.services.single(serviceId),
    enabled: !!serviceId,
    staleTime: SERVICE_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId!)
        .single()

      if (error) throw error
      return normalizeOwned(data as Record<string, unknown>)
    },
  })
}

export function usePublicServicesInMyLeague(
  groupId: string | null,
  serviceType: ServiceType | null,
) {
  return useQuery({
    queryKey: queryKeys.services.publicList(groupId, serviceType),
    enabled: !!groupId,
    staleTime: SERVICE_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_services', {
        p_viewer_group_id: groupId!,
        p_service_type: serviceType,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizePublicServiceRow)
    },
  })
}

export interface CreateServiceInput {
  group_id: string
  service_type: ServiceType
  title: string
  description: string | null
  region: string | null
  price_divine: number | null
  price_min_divine: number | null
  price_max_divine: number | null
  poe_ign: string
  whisper_template: string | null
  availability: ServiceAvailability
  mod_exclusions: string[]
  details: ServiceDetails
  visibility: ServiceVisibility
}

export function useCreateService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: CreateServiceInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const insertPayload = {
        ...values,
        user_id: user.id,
        details: values.details ?? buildDefaultDetails(values.service_type),
      }

      const { data, error } = await supabase
        .from('services')
        .insert(insertPayload)
        .select()
        .single()

      if (error) throw error
      return normalizeOwned(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      invalidateServiceCaches(queryClient, { groupId: data.group_id, serviceId: data.id })
    },
  })
}

export type UpdateServiceInput = Partial<Omit<CreateServiceInput, 'group_id'>> & {
  is_active?: boolean
}

export function useUpdateService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (args: { id: string; patch: UpdateServiceInput }) => {
      const { data, error } = await supabase
        .from('services')
        .update(args.patch)
        .eq('id', args.id)
        .select()
        .single()

      if (error) throw error
      return normalizeOwned(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      invalidateServiceCaches(queryClient, { groupId: data.group_id, serviceId: data.id })
    },
  })
}

export function useDeleteService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (args: { id: string; group_id: string }) => {
      const { error } = await supabase.from('services').delete().eq('id', args.id)
      if (error) throw error
      return args
    },
    onSuccess: (args) => {
      invalidateServiceCaches(queryClient, { groupId: args.group_id, serviceId: args.id })
    },
  })
}

export function useSetServiceAvailability() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (args: { id: string; availability: ServiceAvailability }) => {
      const { data, error } = await supabase
        .from('services')
        .update({ availability: args.availability })
        .eq('id', args.id)
        .select()
        .single()

      if (error) throw error
      return normalizeOwned(data as Record<string, unknown>)
    },
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: ['services'] })

      const previousLists = queryClient.getQueriesData<OwnedService[]>({
        queryKey: ['services', 'mine'],
      })
      const previousSingle = queryClient.getQueryData<OwnedService>(
        queryKeys.services.single(args.id),
      )

      queryClient.setQueriesData<OwnedService[]>(
        { queryKey: ['services', 'mine'] },
        (old) =>
          old?.map((s) =>
            s.id === args.id ? { ...s, availability: args.availability } : s,
          ),
      )
      if (previousSingle) {
        queryClient.setQueryData<OwnedService>(queryKeys.services.single(args.id), {
          ...previousSingle,
          availability: args.availability,
        })
      }

      return { previousLists, previousSingle }
    },
    onError: (_err, args, context) => {
      context?.previousLists.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (context?.previousSingle) {
        queryClient.setQueryData(queryKeys.services.single(args.id), context.previousSingle)
      }
    },
    onSettled: (data, _err, args) => {
      invalidateServiceCaches(queryClient, {
        groupId: data?.group_id,
        serviceId: data?.id ?? args.id,
      })
    },
  })
}
