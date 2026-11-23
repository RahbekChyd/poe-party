import { ExternalLink } from 'lucide-react'
import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form'
import { DIFFICULTY_OPTIONS, MAP_REQ_FIELDS as mapRequirementFields } from '../../lib/constants'
import { FieldInput, FieldTextArea, ListBox, SelectField } from '../ui/heroui-native'
import { toFieldStringValue, type StrategyFormInput, type StrategyFormValues } from './strategy-form'

export interface StrategyFieldProps {
  control: Control<StrategyFormInput, unknown, StrategyFormValues>
  errors: FieldErrors<StrategyFormInput>
}

const MAP_REQ_FIELDS = mapRequirementFields as {
  key: keyof StrategyFormInput['map_requirements']
  label: string
}[]

export function StrategyBasicsFields({ control, errors }: StrategyFieldProps) {
  return (
    <>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <FieldInput
            ref={field.ref}
            name={field.name}
            label="Name"
            placeholder="e.g. T16 Harvest Farming"
            size="sm"
            isInvalid={!!errors.name}
            errorMessage={errors.name?.message}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <FieldTextArea
            ref={field.ref}
            name={field.name}
            label="Description"
            placeholder="Optional notes, goals, or setup details"
            minRows={2}
            size="sm"
            isInvalid={!!errors.description}
            errorMessage={errors.description?.message}
            value={field.value ?? ''}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Controller
        control={control}
        name="difficulty"
        render={({ field }) => (
          <SelectField
            label="Difficulty"
            selectedKey={field.value}
            onSelectionChange={(key) => {
              if (key === 'easy' || key === 'normal' || key === 'hard') field.onChange(key)
            }}
            onBlur={field.onBlur}
          >
            {DIFFICULTY_OPTIONS.map((opt) => (
              <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
                {opt.label}
              </ListBox.Item>
            ))}
          </SelectField>
        )}
      />
    </>
  )
}

export function StrategyAtlasField({ control }: Pick<StrategyFieldProps, 'control'>) {
  const atlasUrl = useWatch({ control, name: 'atlas_tree_url' })
  return (
    <div className="flex items-end gap-2">
      <Controller
        control={control}
        name="atlas_tree_url"
        render={({ field }) => (
          <FieldInput
            ref={field.ref}
            name={field.name}
            label="Atlas tree URL"
            placeholder="https://www.pathofexile.com/fullscreen-atlas-skill-tree/…"
            size="sm"
            className="min-w-0 flex-1"
            value={toFieldStringValue(field.value)}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <a
        href={atlasUrl?.trim() || 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/'}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open Atlas tree (new tab)"
        className="button button--sm button--tertiary button--icon-only shrink-0"
      >
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  )
}

export function StrategyMapFields({ control, errors }: StrategyFieldProps) {
  const mapTradeUrl = useWatch({ control, name: 'map_trade_link' })
  return (
    <>
      <div className="flex items-end gap-2">
        <Controller
          control={control}
          name="map_trade_link"
          render={({ field }) => (
            <FieldInput
              ref={field.ref}
              name={field.name}
              label="Trade link"
              placeholder="https://www.pathofexile.com/trade/…"
              size="sm"
              className="min-w-0 flex-1"
              value={toFieldStringValue(field.value)}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        {mapTradeUrl && (
          <a
            href={mapTradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open map trade search (new tab)"
            className="button button--sm button--tertiary button--icon-only shrink-0"
          >
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      <Controller
        control={control}
        name="map_cost"
        render={({ field }) => (
          <FieldInput
            ref={field.ref}
            name={field.name}
            label="Estimated map cost"
            placeholder="—"
            type="number"
            min={0}
            step={1}
            size="sm"
            className="max-w-50"
            endContent={<span className="text-default-600 text-sm font-semibold">c</span>}
            value={toFieldStringValue(field.value)}
            isInvalid={!!errors.map_cost}
            errorMessage={errors.map_cost?.message}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MAP_REQ_FIELDS.map(({ key, label }) => (
          <Controller
            key={key}
            control={control}
            name={`map_requirements.${key}`}
            render={({ field }) => (
              <FieldInput
                ref={field.ref}
                name={field.name}
                label={label}
                placeholder="—"
                type="number"
                min={0}
                step="any"
                size="sm"
                endContent={<span className="text-default-400 text-xs">%</span>}
                value={toFieldStringValue(field.value)}
                isInvalid={!!errors.map_requirements?.[key]}
                errorMessage={errors.map_requirements?.[key]?.message}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        ))}
      </div>
    </>
  )
}
