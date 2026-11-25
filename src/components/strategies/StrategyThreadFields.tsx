import { useEffect, useRef } from 'react'
import { Button } from '@heroui/react/button'
import { ComboBox } from '@heroui/react/combo-box'
import { Description } from '@heroui/react/description'
import { FieldError } from '@heroui/react/field-error'
import { Input } from '@heroui/react/input'
import { Label } from '@heroui/react/label'
import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import type { ThreadEntry, ThreadMarket } from '../../hooks/useThreadData'
import { ListBox, NativeCheckbox, SelectField } from '../ui/heroui-native'
import { formatChaosValue } from './strategy-form'
import type { StrategyFieldProps } from './StrategyFormFields'

const THREAD_QUANTITIES = ['1', '2', '3', '4', '5', '6', '7', '8']

function ThreadIcon({ entry }: { entry: ThreadEntry | undefined }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center" aria-hidden="true">
      {entry?.icon && (
        <img src={entry.icon} alt="" width={32} height={32} className="size-8 object-contain" />
      )}
    </span>
  )
}

function ThreadNameField({
  entries,
  value,
  onChange,
  onBlur,
  inputRef,
  error,
  label = 'Thread name',
}: {
  entries: ThreadEntry[]
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  inputRef: (node: HTMLInputElement | null) => void
  error?: string
  label?: string
}) {
  const selectedThread = entries.find((thread) => thread.name === value)
  const filteredThreads = entries.filter((thread) =>
    thread.name.toLowerCase().includes(value.toLowerCase()),
  )

  return (
    <ComboBox
      allowsCustomValue
      allowsEmptyCollection
      aria-label={label}
      className="min-w-28 flex-1"
      inputValue={value}
      isInvalid={!!error}
      selectedKey={selectedThread?.name ?? null}
      onInputChange={onChange}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key))
      }}
      onBlur={onBlur}
    >
      <ComboBox.InputGroup className="min-h-9">
        <Input ref={inputRef} placeholder={label} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover className="!max-h-80 overflow-y-auto">
        <ListBox>
          {filteredThreads.map((thread) => (
            <ListBox.Item
              key={thread.name}
              id={thread.name}
              textValue={thread.name}
              aria-label={thread.chaosValue == null
                ? thread.name
                : `${thread.name}, ${formatChaosValue(thread.chaosValue)} chaos each`}
            >
              <ThreadIcon entry={thread} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Label>{thread.name}</Label>
                {thread.chaosValue != null && (
                  <Description>{formatChaosValue(thread.chaosValue)}c each</Description>
                )}
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
      {error ? <FieldError>{error}</FieldError> : null}
    </ComboBox>
  )
}

function threadCost(entry: ThreadEntry | undefined, quantity: unknown): number | null {
  const count = Number(quantity)
  if (!Number.isInteger(count) || count < 1 || count > 8 || entry?.chaosValue == null) return null
  return entry.chaosValue * count
}

function ThreadCost({ amount }: { amount: number | null }) {
  return (
    <span className="text-default-500 shrink-0 text-xs tabular-nums">
      {amount == null ? <span aria-label="Unknown cost">—</span> : `~ ${formatChaosValue(amount)}c`}
    </span>
  )
}

function ThreadAlternatives({
  control,
  errors,
  index,
  entries,
}: StrategyFieldProps & { index: number; entries: ThreadEntry[] }) {
  const path = `threads.${index}.alternatives` as const
  const { fields, append, remove } = useFieldArray({ control, name: path })
  const alternatives = useWatch({ control, name: path }) ?? []
  const quantity = useWatch({ control, name: `threads.${index}.quantity` })

  return (
    <div className="border-divider mt-3 flex flex-col gap-2 border-t pt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-default-500 text-xs">Alternatives use the same quantity.</p>
        <Button size="sm" variant="tertiary" type="button" onPress={() => append({ name: '' })}>
          Add alternative
        </Button>
      </div>
      {fields.map((alternative, alternativeIndex) => {
        const entry = entries.find((item) => item.name === alternatives[alternativeIndex]?.name)
        const error = errors.threads?.[index]?.alternatives?.[alternativeIndex]?.name?.message
        return (
          <div key={alternative.id} className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:min-w-48 sm:flex-1">
              <ThreadIcon entry={entry} />
              <Controller
                control={control}
                name={`${path}.${alternativeIndex}.name`}
                render={({ field }) => (
                  <ThreadNameField
                    entries={entries}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                    error={error}
                    label="Alternative Thread name"
                  />
                )}
              />
            </div>
            <ThreadCost amount={threadCost(entry, quantity)} />
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              type="button"
              aria-label="Remove alternative Thread"
              onPress={() => remove(alternativeIndex)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

export function StrategyThreadFields({
  control,
  errors,
  market,
}: StrategyFieldProps & { market: ThreadMarket }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'threads' })
  const threads = useWatch({ control, name: 'threads' }) ?? []
  const pendingInput = useRef<HTMLInputElement | null>(null)
  const pendingIndex = useRef<number | null>(null)

  useEffect(() => {
    if (pendingIndex.current == null || !fields[pendingIndex.current]) return
    const frame = requestAnimationFrame(() => {
      pendingInput.current?.focus()
      pendingInput.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      pendingIndex.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [fields])

  const rows = fields.map((field, index) => {
    const thread = threads[index]
    const entry = market.data.find((item) => item.name === thread?.name)
    return { field, entry, cost: threadCost(entry, thread?.quantity) }
  })
  const pricedRows = rows.filter((row) => row.cost != null)
  const total = pricedRows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
  const hasAlternatives = threads.some((thread) => thread.alternatives.length > 0)
  const limitError = errors.root?.threadLimit?.message

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <p className="text-default-600 max-w-[42ch] text-sm sm:flex-1">
          Use up to 8 paid Threads per type and 3 types per map. Free Atlas Threads are additional.
        </p>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          className="shrink-0"
          onPress={() => {
            pendingIndex.current = fields.length
            append({ name: '', quantity: 1, required: true, alternatives: [] }, { shouldFocus: false })
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add thread
        </Button>
      </div>
      {market.status === 'loading' && (
        <p role="status" className="text-default-500 text-sm">Loading Thread prices…</p>
      )}
      {market.status === 'unavailable' && (
        <p role="status" className="text-default-500 text-sm">No live Thread prices for this league.</p>
      )}
      {market.status === 'error' && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-default-500 text-sm">Could not load Thread prices.</p>
          <Button size="sm" variant="tertiary" type="button" onPress={market.retry}>
            Retry prices
          </Button>
        </div>
      )}
      {rows.map(({ field, entry, cost }, index) => (
        <div key={field.id} className="border-divider rounded-large min-w-0 border p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:min-w-48 sm:flex-1">
              <ThreadIcon entry={entry} />
              <Controller
                control={control}
                name={`threads.${index}.name`}
                render={({ field: nameField }) => (
                  <ThreadNameField
                    entries={market.data}
                    value={nameField.value ?? ''}
                    onChange={nameField.onChange}
                    onBlur={nameField.onBlur}
                    inputRef={(node) => {
                      nameField.ref(node)
                      if (node && pendingIndex.current === index) pendingInput.current = node
                    }}
                    error={errors.threads?.[index]?.name?.message}
                  />
                )}
              />
            </div>
            <Controller
              control={control}
              name={`threads.${index}.quantity`}
              render={({ field: quantityField }) => (
                <SelectField
                  name={quantityField.name}
                  aria-label="Thread quantity"
                  className="w-20"
                  isInvalid={!!errors.threads?.[index]?.quantity}
                  errorMessage={errors.threads?.[index]?.quantity?.message}
                  selectedKey={String(quantityField.value)}
                  onSelectionChange={(key) => {
                    if (typeof key === 'string') quantityField.onChange(Number(key))
                  }}
                  onBlur={quantityField.onBlur}
                >
                  {THREAD_QUANTITIES.map((quantity) => (
                    <ListBox.Item key={quantity} id={quantity} textValue={quantity}>
                      {quantity}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </SelectField>
              )}
            />
            <ThreadCost amount={cost} />
            <Controller
              control={control}
              name={`threads.${index}.required`}
              render={({ field: requiredField }) => (
                <NativeCheckbox
                  id={`thread-${field.id}-required`}
                  isSelected={requiredField.value}
                  onChange={requiredField.onChange}
                >
                  Required
                </NativeCheckbox>
              )}
            />
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              type="button"
              aria-label="Remove Thread"
              onPress={() => remove(index)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </Button>
          </div>
          <ThreadAlternatives control={control} errors={errors} index={index} entries={market.data} />
        </div>
      ))}
      {typeof limitError === 'string' && (
        <p role="alert" className="text-danger text-sm">{limitError}</p>
      )}
      {pricedRows.length > 0 && (
        <p className="border-divider text-default-500 border-t pt-2 text-right text-xs">
          {hasAlternatives ? 'Primary Thread cost per map' : 'Estimated Thread cost per map'}
          {' · '}
          <span className="text-foreground font-medium tabular-nums">~ {formatChaosValue(total)}c</span>
          {pricedRows.length < rows.length && ' (partial)'}
        </p>
      )}
    </div>
  )
}
