import { Search } from 'lucide-react'
import { FieldInput } from '../ui/heroui-native'

export function StrategySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <FieldInput
      aria-label="Search strategies by name"
      placeholder="Search by name"
      className="w-full min-w-0 sm:max-w-72"
      size="lg"
      startContent={<Search size={18} aria-hidden="true" />}
      value={value}
      onValueChange={onChange}
      isClearable
      onClear={() => onChange('')}
    />
  )
}
