import { getServiceTypeOption, type ServiceType } from '../../lib/service-types'
import { Chip } from '@heroui/react/chip'

export function ServiceTypeChip({
  type,
  size = 'sm',
  useShortLabel = false,
  className,
  classNames,
}: {
  type: ServiceType
  size?: 'sm' | 'md' | 'lg'
  useShortLabel?: boolean
  className?: string
  classNames?: { base?: string; content?: string }
}) {
  const option = getServiceTypeOption(type)
  const Icon = option.icon
  return (
    <Chip
      size={size}
      variant="soft"
      className={classNames?.base ?? className}
    >
      <Icon size={12} aria-hidden="true" />
      <Chip.Label className={classNames?.content}>
        {useShortLabel ? option.shortLabel : option.label}
      </Chip.Label>
    </Chip>
  )
}
