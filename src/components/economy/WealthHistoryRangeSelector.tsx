import {
  WEALTH_HISTORY_RANGE_OPTIONS,
  type WealthHistoryRange,
} from '../../lib/wealth-history'
import { ListBox, SelectField } from '../ui/heroui-native'
interface WealthHistoryRangeSelectorProps {
  value: WealthHistoryRange
  onChange: (next: WealthHistoryRange) => void
}

export function WealthHistoryRangeSelector({
  value,
  onChange,
}: WealthHistoryRangeSelectorProps) {
  return (
    <SelectField
      aria-label="Wealth history time period"
      className="w-40"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (typeof key !== 'string') return
        const next = key as WealthHistoryRange
        onChange(next as WealthHistoryRange)
      }}
    >
      {WEALTH_HISTORY_RANGE_OPTIONS.map((option) => (
        <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
          {option.label}
          <ListBox.ItemIndicator />
        </ListBox.Item>
      ))}
    </SelectField>
  )
}
