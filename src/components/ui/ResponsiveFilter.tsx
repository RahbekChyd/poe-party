import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { ListBox, SelectField } from './heroui-native'

interface FilterOption<Value extends string> {
  value: Value
  label: string
  shortLabel?: string
}

interface ResponsiveFilterProps<Value extends string> {
  label: string
  options: readonly FilterOption<Value>[]
  value: Value
  onChange: (value: Value) => void
}

export function ResponsiveFilter<Value extends string>({
  label,
  options,
  value,
  onChange,
}: ResponsiveFilterProps<Value>) {
  const select = (key: unknown) => {
    const option = options.find((option) => option.value === key)
    if (option) onChange(option.value)
  }

  return (
    <div className="@container min-w-0">
      <div className="@min-[40rem]:hidden">
        <SelectField label={label} selectedKey={value} onSelectionChange={select}>
          {options.map(({ value, label }) => (
            <ListBox.Item key={value} id={value} textValue={label}>
              {label}
            </ListBox.Item>
          ))}
        </SelectField>
      </div>
      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 @min-[40rem]:flex">
        <span className="text-default-500 text-sm font-medium">{label}</span>
        <ToggleButtonGroup
          size="sm"
          aria-label={label}
          className="flex-nowrap"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([value])}
          onSelectionChange={(keys) => select([...keys][0])}
        >
          {options.map(({ value, label, shortLabel }, index) => (
            <ToggleButton key={value} id={value} aria-label={label}>
              {index > 0 ? <ToggleButtonGroup.Separator /> : null}
              {shortLabel ?? label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
    </div>
  )
}
