import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { useCurrentUser } from './useCurrentUser'
type BillingSessionResponse = {
  url?: string
}

async function createBillingSession(functionName: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<BillingSessionResponse>(functionName, {
    body: {},
  })

  if (error) throw error
  if (!data?.url) throw new Error('Billing session did not include a redirect URL')
  return data.url
}

export function useCreateCheckoutSession() {
  const queryClient = useQueryClient()
  const { data: user } = useCurrentUser()

  return useMutation({
    mutationFn: () => createBillingSession('create-checkout-session'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.myProfile(user?.id)] })
    },
  })
}

export function useCreateBillingPortalSession() {
  return useMutation({
    mutationFn: () => createBillingSession('create-billing-portal-session'),
  })
}
