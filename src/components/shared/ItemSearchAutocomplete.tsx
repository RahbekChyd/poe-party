import { ComboBox } from '@heroui/react/combo-box'
import { Description } from '@heroui/react/description'
import { FieldError } from '@heroui/react/field-error'
import { Input } from '@heroui/react/input'
import { Label } from '@heroui/react/label'
import { ListBox } from '@heroui/react/list-box'
import { useNinjaItems } from '../../hooks/useNinjaItems'

export interface SelectedItem {
  name: string
  icon: string
  chaosValue: number
}

interface Props {
  /** Current text value of the input */
  value: string
  /** Called when the text input changes */
  onValueChange: (name: string) => void
  /** Called when an item is selected from the dropdown (null = custom text) */
  onItemSelect?: (item: SelectedItem | null) => void
  label?: string
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  isReadOnly?: boolean
  isInvalid?: boolean
  errorMessage?: string
}

export function ItemSearchAutocomplete({
  value,
  onValueChange,
  onItemSelect,
  label,
  placeholder = 'e.g. Headhunter',
  size = 'md',
  isReadOnly,
  isInvalid,
  errorMessage,
}: Props) {
  const { data: items = [] } = useNinjaItems()
  const selectedItem = items.find((item) => item.name === value)
  const filtered = items
    .filter((item) => item.name.toLowerCase().includes((value ?? '').toLowerCase()))
    .slice(0, 30)

  return (
    <ComboBox
      allowsCustomValue
      allowsEmptyCollection
      inputValue={value}
      isInvalid={isInvalid}
      isReadOnly={isReadOnly}
      selectedKey={selectedItem?.name ?? null}
      onInputChange={(nextValue) => {
        onValueChange(nextValue)
        onItemSelect?.(null)
      }}
      onSelectionChange={(key) => {
        if (key == null) return
        const name = String(key)
        onValueChange(name)
        const match = items.find((item) => item.name === name)
        if (match) {
          onItemSelect?.({ name: match.name, icon: match.icon, chaosValue: match.chaosValue })
        }
      }}
    >
      {label ? <Label>{label}</Label> : null}
      <ComboBox.InputGroup className={size === 'sm' ? 'min-h-9' : size === 'lg' ? 'min-h-12' : undefined}>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {filtered.map((item) => (
            <ListBox.Item key={item.name} id={item.name} textValue={item.name}>
              <img
                src={item.icon}
                alt=""
                className="h-10 w-10 shrink-0 object-contain"
                loading="lazy"
              />
              <div className="flex min-w-0 flex-col">
                <Label>{item.name}</Label>
                <Description>
                  {item.baseType} - {Math.round(item.chaosValue).toLocaleString()}c
                </Description>
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
      {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </ComboBox>
  )
}
