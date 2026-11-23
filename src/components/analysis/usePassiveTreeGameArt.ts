import { useEffect, useRef, useState } from 'react'
import type {
  PassiveTreeArtwork,
  PassiveTreeArtImages,
  PassiveTreeArtSheet,
} from '../../lib/passive-tree-game-art'

const EMPTY_IMAGES: PassiveTreeArtImages = new Map()
const SHEET_TIMEOUT_MS = 12_000

type ArtStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error'

interface ArtLoad {
  artwork: PassiveTreeArtwork
  attempt: number
  images: PassiveTreeArtImages
  pending: number
}

interface ArtCache {
  artwork: PassiveTreeArtwork
  images: Map<string, HTMLImageElement>
  completedAttempt: number | null
}

function loadSheet(sheet: PassiveTreeArtSheet, signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(cancel, SHEET_TIMEOUT_MS)

    function settle(result: HTMLImageElement | null) {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      image.onload = null
      image.onerror = null
      resolve(result)
    }

    function cancel() {
      settle(null)
      image.removeAttribute('src')
    }

    signal.addEventListener('abort', cancel, { once: true })
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => {
      const matched = image.naturalWidth === sheet.width && image.naturalHeight === sheet.height
      settle(matched ? image : null)
    }
    image.onerror = () => settle(null)
    image.src = sheet.url
  })
}

function getStatus(artwork: PassiveTreeArtwork | undefined, load: ArtLoad | null): ArtStatus {
  if (!artwork) return 'idle'
  if (!load || load.pending > 0) return 'loading'
  if (load.images.size === artwork.sheets.length) return 'ready'
  return load.images.size ? 'partial' : 'error'
}

export function usePassiveTreeGameArt(artwork: PassiveTreeArtwork | undefined) {
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<ArtLoad | null>(null)
  const cache = useRef<ArtCache | null>(null)

  useEffect(() => {
    if (!artwork) return
    const cached = cache.current?.artwork === artwork
      ? cache.current
      : { artwork, images: new Map<string, HTMLImageElement>(), completedAttempt: null }
    if (cached.completedAttempt === attempt) return
    cache.current = cached
    const controller = new AbortController()
    const { images } = cached
    const missing = artwork.sheets.filter((sheet) => !images.has(sheet.url))
    let pending = missing.length

    const publish = () => {
      if (controller.signal.aborted) return
      if (!pending) cached.completedAttempt = attempt
      setLoad({ artwork, attempt, images: new Map(images), pending })
    }

    if (!pending) queueMicrotask(publish)
    for (const sheet of missing) {
      void loadSheet(sheet, controller.signal).then((image) => {
        if (controller.signal.aborted) return
        if (image) images.set(sheet.url, image)
        pending -= 1
        publish()
      })
    }

    return () => controller.abort()
  }, [artwork, attempt])

  const currentLoad = load?.artwork === artwork ? load : null
  return {
    status: getStatus(artwork, currentLoad?.attempt === attempt ? currentLoad : null),
    images: currentLoad?.images ?? EMPTY_IMAGES,
    retry: () => setAttempt((previous) => previous + 1),
  }
}
