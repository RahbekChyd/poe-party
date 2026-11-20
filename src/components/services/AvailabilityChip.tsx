
import { getAvailabilityOption, type ServiceAvailability } from '../../lib/service-types'
import { Chip } from '@heroui/react/chip'
import { Check, Clock3, Minus } from 'lucide-react'

export function AvailabilityChip({
  status,
  size = 'sm',
  className,
  classNames,
}: {
  status: ServiceAvailability
  size?: 'sm' | 'md' | 'lg'
  className?: string
  classNames?: { base?: string; content?: string }
}) {
  const option = getAvailabilityOption(status)
  const StatusIcon = status === 'available' ? Check : status === 'busy' ? Clock3 : Minus
  return (
    <Chip
      size={size}
      color={option.chipColor}
      variant="soft"
      className={classNames?.base ?? className}
    >
      <StatusIcon size={12} aria-hidden="true" />
      <Chip.Label className={classNames?.content}>{option.label}</Chip.Label>
    </Chip>
  )
}
