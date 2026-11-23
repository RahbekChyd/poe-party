import {
  type ChangeEventHandler,
  type ComponentProps,
  type FocusEvent,
  type Key,
  type ReactNode,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react'
import { Avatar } from '@heroui/react/avatar'
import { Button } from '@heroui/react/button'
import { Checkbox } from '@heroui/react/checkbox'
import { Description } from '@heroui/react/description'
import { FieldError } from '@heroui/react/field-error'
import { Input } from '@heroui/react/input'
import { InputGroup } from '@heroui/react/input-group'
import { Label } from '@heroui/react/label'
import { ListBox } from '@heroui/react/list-box'
import { Pagination } from '@heroui/react/pagination'
import { Select } from '@heroui/react/select'
import { TextArea } from '@heroui/react/textarea'
import { TextField } from '@heroui/react/textfield'
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn, contrastColor } from '../../lib/utils'
import { HoverTooltip } from './hover-tooltip'

interface FieldInputProps extends Omit<
  ComponentProps<typeof InputGroup.Input>,
  'className' | 'onChange' | 'size'
> {
  className?: string
  description?: ReactNode
  endContent?: ReactNode
  errorMessage?: ReactNode
  isClearable?: boolean
  isDisabled?: boolean
  isInvalid?: boolean
  isReadOnly?: boolean
  isRequired?: boolean
  label?: ReactNode
  onChange?: ChangeEventHandler<HTMLInputElement>
  onClear?: () => void
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
  startContent?: ReactNode
}

export const FieldInput = forwardRef<HTMLInputElement, FieldInputProps>(function FieldInput(
  {
    className,
    description,
    endContent,
    errorMessage,
    isClearable,
    isDisabled,
    isInvalid,
    isReadOnly,
    isRequired,
    label,
    onChange,
    onClear,
    onValueChange,
    size,
    startContent,
    value,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...props
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current!)

  const controlSizeClassName =
    size === 'lg' ? 'min-h-12' : size === 'sm' ? 'h-9 min-h-9' : 'min-h-10'
  const affixClassName = cn(
    'flex h-full shrink-0 items-center justify-center whitespace-nowrap text-field-placeholder',
    size === 'sm' ? 'px-2.5' : undefined,
  )
  const inputClassName = cn('min-w-0', size === 'lg' ? 'text-base' : 'text-sm')
  const canClear = isClearable && value && onClear && !isDisabled && !isReadOnly
  const hasTrailingContent = canClear || !!endContent

  return (
    <TextField
      className={className}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isReadOnly={isReadOnly}
      isRequired={isRequired}
      aria-label={
        ariaLabel ??
        (!label && typeof props.placeholder === 'string' ? props.placeholder : undefined)
      }
      aria-labelledby={ariaLabelledBy}
    >
      {label ? <Label>{label}</Label> : null}
      {startContent || endContent || isClearable ? (
        <InputGroup fullWidth className={cn('w-full', controlSizeClassName, isClearable && 'clearable-field')}>
          {startContent ? (
            <InputGroup.Prefix className={cn(affixClassName, '[&_svg]:size-4')}>
              {startContent}
            </InputGroup.Prefix>
          ) : null}
          <InputGroup.Input
            ref={inputRef}
            className={inputClassName}
            value={value}
            onChange={(event) => {
              onChange?.(event)
              onValueChange?.(event.target.value)
            }}
            {...props}
          />
          {hasTrailingContent ? (
            <InputGroup.Suffix className={cn(affixClassName, 'gap-1', isClearable && 'pr-1')}>
              {canClear ? (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  aria-label="Clear"
                  onPress={() => {
                    inputRef.current?.focus()
                    onClear()
                  }}
                  className="field-clear-button h-7 min-h-7 w-7 min-w-7"
                >
                  <X size={14} />
                </Button>
              ) : null}
              {endContent ? <span className="inline-flex items-center">{endContent}</span> : null}
            </InputGroup.Suffix>
          ) : null}
        </InputGroup>
      ) : (
        <Input
          ref={inputRef}
          className={cn('w-full', controlSizeClassName, inputClassName)}
          value={value}
          onChange={(event) => {
            onChange?.(event)
            onValueChange?.(event.target.value)
          }}
          {...props}
        />
      )}
      {description ? <Description>{description}</Description> : null}
      {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </TextField>
  )
})

interface FieldTextAreaProps extends Omit<
  ComponentProps<typeof TextArea>,
  'className' | 'onChange' | 'size'
> {
  className?: string
  description?: ReactNode
  errorMessage?: ReactNode
  isDisabled?: boolean
  isInvalid?: boolean
  isReadOnly?: boolean
  isRequired?: boolean
  label?: ReactNode
  minRows?: number
  onChange?: ChangeEventHandler<HTMLTextAreaElement>
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

export const FieldTextArea = forwardRef<HTMLTextAreaElement, FieldTextAreaProps>(
  function FieldTextArea(
    {
      className,
      description,
      errorMessage,
      isDisabled,
      isInvalid,
      isReadOnly,
      isRequired,
      label,
      minRows,
      onChange,
      onValueChange,
      ...props
    },
    ref,
  ) {
    return (
      <TextField
        className={className}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
        isReadOnly={isReadOnly}
        isRequired={isRequired}
      >
        {label ? <Label>{label}</Label> : null}
        <TextArea
          ref={ref}
          rows={minRows}
          onChange={(event) => {
            onChange?.(event)
            onValueChange?.(event.target.value)
          }}
          {...props}
        />
        {description ? <Description>{description}</Description> : null}
        {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </TextField>
    )
  },
)

interface SelectFieldProps extends Omit<ComponentProps<typeof Select>, 'children'> {
  children: ReactNode
  description?: ReactNode
  errorMessage?: ReactNode
  isInvalid?: boolean
  label?: ReactNode
  popoverClassName?: string
  popoverProps?: Omit<ComponentProps<typeof Select.Popover>, 'children' | 'className'>
}

export function SelectField({
  children,
  className,
  description,
  errorMessage,
  isInvalid,
  label,
  popoverClassName,
  popoverProps,
  ...props
}: SelectFieldProps) {
  const revealFocusedOption = (event: FocusEvent<HTMLElement>) => {
    const option = event.target.closest('[role="option"]')
    if (!option) return

    // Placement can shrink a portalled list after React Aria focuses the selected option.
    requestAnimationFrame(() => {
      if (option.contains(document.activeElement)) {
        option.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Select isInvalid={isInvalid} className={cn('w-full', className)} {...props}>
        {label ? <Label>{label}</Label> : null}
        <Select.Trigger className="h-10 min-h-10 w-full items-center">
          <Select.Value />
          <Select.Indicator>
            <ChevronDown size={16} aria-hidden="true" />
          </Select.Indicator>
        </Select.Trigger>
        <Select.Popover className={popoverClassName} {...popoverProps}>
          <div onFocusCapture={revealFocusedOption}>
            <ListBox>{children}</ListBox>
          </div>
        </Select.Popover>
      </Select>
      {description ? <Description>{description}</Description> : null}
      {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </div>
  )
}

export function DropdownCaret({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-caret="dropdown"
      className={cn(
        'text-default-400 pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center self-center align-middle leading-none [&_svg]:block',
        className,
      )}
    >
      <ChevronDown size={16} strokeWidth={2} />
    </span>
  )
}

export function NativeCheckbox({
  children,
  id,
  ...props
}: Omit<ComponentProps<typeof Checkbox>, 'children'> & { children: ReactNode; id: string }) {
  return (
    <Checkbox id={id} {...props}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>
        <Label>{children}</Label>
      </Checkbox.Content>
    </Checkbox>
  )
}

export function UserAvatar({
  className,
  fallbackClassName,
  name,
  src,
  style,
  size = 'md',
}: {
  className?: string
  fallbackClassName?: string
  name?: string | null
  size?: ComponentProps<typeof Avatar>['size']
  src?: string | null
  style?: ComponentProps<typeof Avatar>['style']
}) {
  const fallback = (name?.trim() || '?').slice(0, 2).toUpperCase()
  const avatarColor = style?.backgroundColor
  const hexColor = typeof avatarColor === 'string' && /^#[0-9a-f]{6}$/i.test(avatarColor)
    ? Number.parseInt(avatarColor.slice(1), 16)
    : null
  return (
    <Avatar className={className} size={size} style={style}>
      {src ? <Avatar.Image alt={name ?? ''} src={src} /> : null}
      <Avatar.Fallback
        className={cn('font-semibold', fallbackClassName)}
        style={hexColor === null ? undefined : {
          backgroundColor: avatarColor,
          color: contrastColor(hexColor >> 16, (hexColor >> 8) & 255, hexColor & 255),
        }}
      >
        {fallback}
      </Avatar.Fallback>
    </Avatar>
  )
}

export function IconTooltip({
  children,
  content,
  className,
}: {
  children: ReactNode
  className?: string
  content: ReactNode
}) {
  return (
    <HoverTooltip as="span" className={cn('inline-flex', className)} content={content}>
      {children}
    </HoverTooltip>
  )
}

export function SimplePagination({
  className,
  onChange,
  page,
  total,
}: {
  className?: string
  onChange?: (page: number) => void
  page?: number
  total?: number
}) {
  const max = Math.max(1, Number(total ?? 1))
  const current = Math.min(max, Math.max(1, Number(page ?? 1)))
  const visiblePages = getVisiblePaginationPages(current, max)
  return (
    <div className={cn('@container/pager min-w-0', className)}>
      <Pagination aria-label="Snapshot pages">
        <Pagination.Content className="flex-wrap justify-center">
          <Pagination.Item>
            <Pagination.Previous
              isDisabled={current <= 1}
              aria-label="Previous page"
              onPress={() => onChange?.(Math.max(1, current - 1))}
            >
              <Pagination.PreviousIcon>
                <ChevronLeft size={14} />
              </Pagination.PreviousIcon>
              <span className="hidden @min-[36rem]/pager:inline">Previous</span>
            </Pagination.Previous>
          </Pagination.Item>
          <Pagination.Item className="@min-[36rem]/pager:hidden">
            <span className="text-default-600 px-2 text-sm tabular-nums" role="status">
              Page {current} of {max}
            </span>
          </Pagination.Item>
          {visiblePages.map((item, index) =>
            item === 'ellipsis' ? (
              <Pagination.Item key={`ellipsis-${index}`} className="hidden @min-[36rem]/pager:list-item">
                <Pagination.Ellipsis />
              </Pagination.Item>
            ) : (
              <Pagination.Item key={item} className="hidden @min-[36rem]/pager:list-item">
                <Pagination.Link
                  isActive={item === current}
                  aria-label={`Go to page ${item}`}
                  onPress={item === current ? undefined : () => onChange?.(item)}
                >
                  {item}
                </Pagination.Link>
              </Pagination.Item>
            ),
          )}
          <Pagination.Item>
            <Pagination.Next
              isDisabled={current >= max}
              aria-label="Next page"
              onPress={() => onChange?.(Math.min(max, current + 1))}
            >
              <span className="hidden @min-[36rem]/pager:inline">Next</span>
              <Pagination.NextIcon>
                <ChevronRight size={14} />
              </Pagination.NextIcon>
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
      {onChange && max > 1 && (
        <form
          className="mt-2 flex flex-wrap items-center justify-center gap-2 @min-[36rem]/pager:hidden"
          aria-label="Jump to snapshot page"
          onSubmit={(event) => {
            event.preventDefault()
            const requestedPage = Number(new FormData(event.currentTarget).get('page'))
            if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > max) return
            onChange(requestedPage)
            event.currentTarget.reset()
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            Go to page
            <input name="page" type="number" inputMode="numeric" min={1} max={max} required className="input min-h-9 w-20 tabular-nums" />
          </label>
          <Button type="submit" size="sm" variant="tertiary">Go</Button>
        </form>
      )}
    </div>
  )
}

function getVisiblePaginationPages(current: number, max: number): Array<number | 'ellipsis'> {
  if (max <= 7) {
    return Array.from({ length: max }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, max, current, current - 1, current + 1])

  if (current <= 4) {
    for (let page = 2; page <= 5; page += 1) pages.add(page)
  }

  if (current >= max - 3) {
    for (let page = max - 4; page < max; page += 1) pages.add(page)
  }

  const sortedPages = Array.from(pages)
    .filter((item) => item >= 1 && item <= max)
    .sort((a, b) => a - b)
  const visible: Array<number | 'ellipsis'> = []

  sortedPages.forEach((item) => {
    const previous = visible[visible.length - 1]
    if (typeof previous === 'number' && item - previous > 1) {
      visible.push('ellipsis')
    }
    visible.push(item)
  })

  return visible
}

export { ListBox }
export type { Key }
