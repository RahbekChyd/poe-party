import { ListBox } from '@heroui/react/list-box'
import {
  analysisPobLayoutFields,
  type AnalysisPobSetupSelection,
} from '../../lib/analysis-pob-setup'
import { getPobTreeSpecLabel } from '../../lib/pob'
import type { PobImportMetadata } from '../../types/app'
import { SelectField } from '../ui/heroui-native'

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
    <div className="grid min-w-0 gap-x-5 gap-y-4 min-[35rem]:grid-cols-2">
      {analysisPobLayoutFields.map(({ label, description, optionsKey, selectionKey }) => {
        const options = metadata[optionsKey]

        if (options.length === 0) {
          return (
            <div key={selectionKey} className="min-w-0 text-sm">
              <p className="text-foreground font-medium">{label}</p>
              <p className="border-control mt-1 rounded-lg border px-3 py-2">PoB default</p>
              <p className="text-default-500 mt-1 text-xs">
                {description} This export has no selectable layout.
              </p>
            </div>
          )
        }

        return (
          <SelectField
            key={selectionKey}
            label={label}
            description={description}
            selectedKey={selection[selectionKey]}
            isDisabled={isDisabled}
            onSelectionChange={(key) =>
              onSelectionChange(selectionKey, typeof key === 'string' ? key : null)
            }
          >
            {options.map((option) => {
              const title =
                'hashes' in option ? getPobTreeSpecLabel(metadata.tree_specs, option) : option.title
              return (
                <ListBox.Item key={option.id} id={option.id} textValue={title}>
                  {title}
                </ListBox.Item>
              )
            })}
          </SelectField>
        )
      })}
    </div>
  )
}
