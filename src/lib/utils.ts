import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AVATAR_COLORS } from './constants'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Snapshot age thresholds (match Navbar chip colours)
// < 30 min → success, 30 min–2 h → warning, > 2 h → danger
export type SnapshotAgeColor = 'success' | 'warning' | 'danger' | 'default'

export function snapshotAge(completedAt: string | null): {
  label: string
  color: SnapshotAgeColor
} {
  if (!completedAt) return { label: 'No snapshots', color: 'default' }
  const minutes = Math.floor((Date.now() - new Date(completedAt).getTime()) / 60_000)
  if (minutes < 60) return { label: `${minutes}m ago`, color: minutes < 30 ? 'success' : 'warning' }
  const hours = Math.floor(minutes / 60)
  return { label: `${hours}h ago`, color: hours < 2 ? 'warning' : 'danger' }
}

/**
 * Returns '#000000' or '#ffffff' — whichever has better WCAG contrast
 * against the given RGB background color.
 */
export function contrastColor(r: number, g: number, b: number): '#000000' | '#ffffff' {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.179 ? '#000000' : '#ffffff'
}

/**
 * Returns the avatar background color for a user.
 * Uses their chosen color if set, otherwise picks a deterministic one from the palette.
 */
export function getAvatarColor(userId: string, avatarColor: string | null): string {
  if (avatarColor) return avatarColor
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function formatChaos(chaos: number, divineRate = 200): string {
  if (chaos >= divineRate) {
    return `${(chaos / divineRate).toFixed(1)} div`
  }
  return `${Math.round(chaos)}c`
}

export function formatCurrencyAmount(
  chaos: number,
  display: 'chaos' | 'divine',
  divineRate = 200,
): string {
  const sign = chaos < 0 ? '-' : ''
  const absoluteChaos = Math.abs(chaos)
  if (display === 'divine') {
    return `${sign}${(absoluteChaos / divineRate).toFixed(1)} div`
  }
  if (absoluteChaos > 0 && absoluteChaos < 1) {
    return `${sign}${absoluteChaos.toFixed(1)}c`
  }
  return `${sign}${Math.round(absoluteChaos).toLocaleString()}c`
}

export function calculateChaosPerHour<T>(
  points: T[],
  getTimestamp: (point: T) => string,
  getValue: (point: T) => number,
): number | null {
  if (points.length < 2) return null

  const first = points[0]
  const last = points[points.length - 1]
  const elapsedMs = new Date(getTimestamp(last)).getTime() - new Date(getTimestamp(first)).getTime()
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null

  return (getValue(last) - getValue(first)) / (elapsedMs / 3_600_000)
}

export function calculateTrendStats<T>(
  points: T[],
  getValue: (point: T) => number,
): {
  delta: number
  percentChange: number | null
} | null {
  if (points.length < 2) return null

  const firstValue = getValue(points[0])
  const lastValue = getValue(points[points.length - 1])
  const delta = lastValue - firstValue

  return {
    delta,
    percentChange: firstValue === 0 ? null : (delta / firstValue) * 100,
  }
}
