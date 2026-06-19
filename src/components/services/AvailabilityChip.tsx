
import { getAvailabilityOption, type ServiceAvailability } from '../../lib/service-types'
import { Chip } from '@heroui/react/chip'
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
  return (
    <Chip
      size={size}
      color={option.chipColor}
      variant="soft"
      className={classNames?.base ?? className}
    >
      <Chip.Label className={classNames?.content}>{option.label}</Chip.Label>
    </Chip>
  )
}
