import { useState } from 'react'
import { Button } from '@heroui/react/button'
import { resolveWhisperTemplate, type ServiceType } from '../../lib/service-types'
import { trackPublicEvent } from '../../lib/analytics'

type StableButtonSize = 'sm' | 'md' | 'lg'
type StableButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger' | 'danger-soft' | 'flat' | 'bordered'
type StableButtonColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'accent'

function mapButtonVariant(variant: StableButtonVariant, color: StableButtonColor) {
  if (variant === 'flat') return color === 'danger' ? 'danger-soft' : 'tertiary'
  if (variant === 'bordered') return 'secondary'
  if (variant === 'danger' || color === 'danger') return 'danger'
  if (variant === 'danger-soft') return 'danger-soft'
  if (variant === 'secondary') return 'secondary'
  if (variant === 'tertiary') return 'tertiary'
  if (variant === 'outline') return 'outline'
  if (variant === 'ghost') return 'ghost'
  return 'primary'
}
export function WhisperCopyButton({
  ign,
  serviceType,
  title,
  whisperTemplate,
  size = 'sm',
  color = 'warning',
  variant = 'flat',
  showPreview = false,
  fullWidth = false,
  className,
}: {
  ign: string
  serviceType: ServiceType
  title: string | null
  whisperTemplate: string | null
  size?: StableButtonSize
  color?: StableButtonColor
  variant?: StableButtonVariant
  showPreview?: boolean
  fullWidth?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const template = resolveWhisperTemplate({
    ign,
    serviceType,
    title,
    whisperTemplate,
  })

  async function onPress() {
    try {
      await navigator.clipboard.writeText(template)
      trackPublicEvent('service_whisper_copy', {
        service_type: serviceType,
        title: title ?? '',
      })
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard may be blocked; swallow silently
    }
  }

  const label = copied ? 'Copied!' : 'Copy Whisper'

  return (
    <div className={fullWidth ? 'w-full' : undefined}>
      <Button
        size={size}
        variant={mapButtonVariant(variant, color)}
        onPress={onPress}
        fullWidth={fullWidth}
        className={className}
      >
        {label}
      </Button>
      {showPreview ? (
        <p className="mt-2 break-all font-mono text-xs text-default-400">{template}</p>
      ) : null}
    </div>
  )
}
