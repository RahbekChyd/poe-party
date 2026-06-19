import { getServiceTypeOption, type ServiceType } from '../../lib/service-types'
import { Chip } from '@heroui/react/chip'

function mapChipColor(color: string) {
  if (color === 'primary' || color === 'secondary') return 'accent'
  if (color === 'success' || color === 'warning' || color === 'danger' || color === 'default' || color === 'accent') {
    return color
  }
  return 'default'
}

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
      color={mapChipColor(option.colour)}
      variant="soft"
      className={classNames?.base ?? className}
    >
      <Icon size={12} />
      <Chip.Label className={classNames?.content}>
        {useShortLabel ? option.shortLabel : option.label}
      </Chip.Label>
    </Chip>
  )
}
