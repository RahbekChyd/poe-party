import {
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { cn } from '../../lib/utils'

export type HoverTooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

const placementClasses: Record<HoverTooltipPlacement, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  right: 'top-1/2 left-full ml-3 -translate-y-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'top-1/2 right-full mr-3 -translate-y-1/2',
}

interface HoverTooltipProps extends Omit<HTMLAttributes<HTMLElement>, 'content'> {
  as?: 'div' | 'span'
  children: ReactNode
  closeDelay?: number
  content: ReactNode
  contentClassName?: string
  delay?: number
  isDisabled?: boolean
  onHoverChange?: (hovered: boolean) => void
  placement?: HoverTooltipPlacement
  unstyledContent?: boolean
}

export function HoverTooltip({
  as = 'div',
  children,
  className,
  closeDelay = 50,
  content,
  contentClassName,
  delay = 150,
  isDisabled,
  onBlur,
  onFocus,
  onHoverChange,
  onMouseEnter,
  onMouseLeave,
  placement = 'top',
  unstyledContent = false,
  ...props
}: HoverTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const id = useId()
  const openTimeoutRef = useRef<number | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current != null) window.clearTimeout(openTimeoutRef.current)
      if (closeTimeoutRef.current != null) window.clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  if (isDisabled || content == null || content === '') return <>{children}</>

  const clearTimers = () => {
    if (openTimeoutRef.current != null) {
      window.clearTimeout(openTimeoutRef.current)
      openTimeoutRef.current = null
    }
    if (closeTimeoutRef.current != null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const open = () => {
    clearTimers()
    onHoverChange?.(true)
    openTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(true)
      openTimeoutRef.current = null
    }, delay)
  }

  const close = () => {
    clearTimers()
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false)
      onHoverChange?.(false)
      closeTimeoutRef.current = null
    }, closeDelay)
  }

  const handleMouseEnter = (event: MouseEvent<HTMLElement>) => {
    onMouseEnter?.(event)
    open()
  }

  const handleMouseLeave = (event: MouseEvent<HTMLElement>) => {
    onMouseLeave?.(event)
    close()
  }

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    onFocus?.(event)
    open()
  }

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    onBlur?.(event)
    close()
  }

  const tooltip = isOpen ? (
    as === 'span' ? (
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-auto absolute z-50',
          placementClasses[placement],
          unstyledContent
            ? null
            : 'bg-content1 text-foreground border-divider max-w-xs rounded-md border px-2 py-1 text-xs leading-5 shadow-lg',
          contentClassName,
        )}
        onMouseEnter={open}
        onMouseLeave={close}
      >
        {content}
      </span>
    ) : (
      <div
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-auto absolute z-50',
          placementClasses[placement],
          unstyledContent
            ? null
            : 'bg-content1 text-foreground border-divider max-w-xs rounded-md border px-2 py-1 text-xs leading-5 shadow-lg',
          contentClassName,
        )}
        onMouseEnter={open}
        onMouseLeave={close}
      >
        {content}
      </div>
    )
  ) : null

  if (as === 'span') {
    return (
      <span
        {...props}
        aria-describedby={isOpen ? id : undefined}
        className={cn('relative', className ?? 'inline-flex')}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {tooltip}
      </span>
    )
  }

  return (
    <div
      {...props}
      aria-describedby={isOpen ? id : undefined}
      className={cn('relative', className ?? 'inline-flex')}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {tooltip}
    </div>
  )
}
