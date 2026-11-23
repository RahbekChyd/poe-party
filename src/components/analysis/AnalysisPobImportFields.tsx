import type { ReactNode } from 'react'
import { FieldInput, FieldTextArea } from '../ui/heroui-native'

export function AnalysisPobImportFields({
  value,
  onValueChange,
  name,
  onNameChange,
  isPending,
  error,
  savedSources,
}: {
  value: string
  onValueChange: (value: string) => void
  name: string
  onNameChange: (name: string) => void
  isPending: boolean
  error: string | null
  savedSources?: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <FieldTextArea
        label="PoB import"
        minRows={5}
        placeholder="Paste a share code or exported XML"
        value={value}
        onValueChange={onValueChange}
        isDisabled={isPending}
        isInvalid={!!error}
        errorMessage={error ?? undefined}
      />
      {savedSources ? <div className="flex flex-wrap gap-2">{savedSources}</div> : null}
      <FieldInput
        label="Target name"
        description="Optional"
        maxLength={120}
        value={name}
        onValueChange={onNameChange}
        isDisabled={isPending}
      />
      {error ? (
        <p role="alert" className="sr-only">
          {error}
        </p>
      ) : null}
    </div>
  )
}
