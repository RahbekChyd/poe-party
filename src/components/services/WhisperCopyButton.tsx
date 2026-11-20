import { useEffect, useRef, useState } from 'react'
import { Button } from '@heroui/react/button'
import { resolveWhisperTemplate, type ServiceType } from '../../lib/service-types'
import { trackPublicEvent } from '../../lib/analytics'

export function WhisperCopyButton({
  ign,
  serviceType,
  title,
  whisperTemplate,
  size = 'sm',
  showPreview = false,
}: {
  ign: string
  serviceType: ServiceType
  title: string | null
  whisperTemplate: string | null
  size?: 'sm' | 'md' | 'lg'
  showPreview?: boolean
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const resetTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(resetTimer.current), [])
  const template = resolveWhisperTemplate({
    ign,
    serviceType,
    title,
    whisperTemplate,
  })

  async function onPress() {
    window.clearTimeout(resetTimer.current)
    try {
      await navigator.clipboard.writeText(template)
    } catch {
      setCopyStatus('error')
      return
    }
    setCopyStatus('copied')
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopyStatus('idle'), 1500)
    trackPublicEvent('service_whisper_copy', {
      service_type: serviceType,
      title: title ?? '',
    })
  }

  return (
    <div className="min-w-0">
      <Button size={size} variant="tertiary" onPress={onPress}>
        {copyStatus === 'copied' ? 'Copied!' : 'Copy whisper'}
      </Button>
      <span role="status" className="sr-only">
        {copyStatus === 'copied' ? 'Whisper copied to clipboard.' : null}
      </span>
      {copyStatus === 'error' ? (
        <p role="alert" className="text-danger mt-2 text-xs">
          Clipboard unavailable. Select and copy the whisper below.
        </p>
      ) : null}
      {showPreview || copyStatus === 'error' ? (
        <p className="mt-2 wrap-anywhere select-text font-mono text-xs text-default-600">{template}</p>
      ) : null}
    </div>
  )
}
