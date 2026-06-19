import { useEffect, useState } from 'react'
import { useSetServiceAvailability } from './useServices'
import type { ServiceAvailability } from '../lib/service-types'
export function useServiceAvailabilityControl(
  serviceId: string | null,
  availability: ServiceAvailability | null,
) {
  const { mutate: setAvailability } = useSetServiceAvailability()
  const [optimisticAvailability, setOptimisticAvailability] = useState<ServiceAvailability | null>(
    null,
  )
  const [availabilityPending, setAvailabilityPending] = useState(false)

  useEffect(() => {
    setOptimisticAvailability(null)
    setAvailabilityPending(false)
  }, [serviceId])

  useEffect(() => {
    if (availability != null && optimisticAvailability === availability) {
      setOptimisticAvailability(null)
    }
  }, [availability, optimisticAvailability])

  const displayAvailability = optimisticAvailability ?? availability ?? 'available'

  function updateAvailability(next: ServiceAvailability) {
    if (!serviceId || availabilityPending || next === displayAvailability) return

    setOptimisticAvailability(next)
    setAvailabilityPending(true)
    setAvailability(
      { id: serviceId, availability: next },
      {
        onError: () => {
          setOptimisticAvailability(null)
          setAvailabilityPending(false)
        },
        onSuccess: () => {
          setAvailabilityPending(false)
        },
      },
    )
  }

  return {
    availability: displayAvailability,
    availabilityPending,
    updateAvailability,
  }
}
