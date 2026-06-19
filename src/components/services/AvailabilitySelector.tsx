import {
  AVAILABILITY_OPTIONS,
  getAvailabilityOption,
  type ServiceAvailability,
} from '../../lib/service-types'
import { Dropdown } from '@heroui/react/dropdown'
import { DropdownCaret } from '../ui/heroui-native'
interface Props {
  availability: ServiceAvailability
  onChange: (next: ServiceAvailability) => void
  isDisabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

function triggerClassName(size: Props['size']): string {
  if (size === 'lg') return 'select__trigger h-12 min-h-12 min-w-40 items-center'
  if (size === 'md') return 'select__trigger h-10 min-h-10 min-w-36 items-center'
  return 'select__trigger h-9 min-h-9 min-w-32 items-center'
}

export function AvailabilitySelector({ availability, onChange, isDisabled, size = 'sm' }: Props) {
  const current = getAvailabilityOption(availability)

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label="Set availability"
        className={triggerClassName(size)}
        isDisabled={isDisabled}
      >
        <span className="select__value min-w-0">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${current.dotClass}`} />
            <span className="truncate">{current.label}</span>
          </span>
        </span>
        <DropdownCaret className="select__indicator" />
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Set availability"
          selectionMode="single"
          selectedKeys={new Set([availability])}
          onAction={(key) => onChange(key as ServiceAvailability)}
        >
          {AVAILABILITY_OPTIONS.map((opt) => (
            <Dropdown.Item key={opt.id} id={opt.id}>
              <Dropdown.ItemIndicator />
              {opt.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
