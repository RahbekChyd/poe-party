import { ListBox } from '@heroui/react/list-box'
import type { PobImportMetadata } from '../../types/app'
import { SelectField } from '../ui/heroui-native'

export type AnalysisPobSetupSelection = {
  treeSpecId: string | null
  itemSetId: string | null
  skillSetId: string | null
  configSetId: string | null
}

const layoutFields = [
  { label: 'Tree', optionsKey: 'tree_specs', selectionKey: 'treeSpecId' },
  { label: 'Item set', optionsKey: 'item_sets', selectionKey: 'itemSetId' },
  { label: 'Skill set', optionsKey: 'skill_sets', selectionKey: 'skillSetId' },
  { label: 'Configuration', optionsKey: 'config_sets', selectionKey: 'configSetId' },
] as const

export function AnalysisPobSetupFields({
  metadata,
  selection,
  onSelectionChange,
  isDisabled,
}: {
  metadata: PobImportMetadata
  selection: AnalysisPobSetupSelection
  onSelectionChange: (field: keyof AnalysisPobSetupSelection, value: string | null) => void
  isDisabled?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-3 min-[35rem]:grid-cols-2">
      {layoutFields.map(({ label, optionsKey, selectionKey }) => {
        const options = metadata[optionsKey]

        if (options.length === 0) {
          return (
            <div key={selectionKey} className="min-w-0 px-1 py-1 text-sm">
              <p className="text-foreground font-medium">{label}</p>
              <p className="text-default-500 mt-1">No layout in this export</p>
            </div>
          )
        }

        return (
          <SelectField
            key={selectionKey}
            label={label}
            selectedKey={selection[selectionKey]}
            isDisabled={isDisabled}
            onSelectionChange={(key) =>
              onSelectionChange(selectionKey, typeof key === 'string' ? key : null)
            }
          >
            {options.map((option) => (
              <ListBox.Item key={option.id} id={option.id} textValue={option.title}>
                {option.title}
              </ListBox.Item>
            ))}
          </SelectField>
        )
      })}
    </div>
  )
}
