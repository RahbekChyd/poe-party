import { track } from '@vercel/analytics'
type AnalyticsProperties = Record<string, string | number | boolean | null>

export function trackProductEvent(name: string, properties?: AnalyticsProperties) {
  try {
    track(name, properties)
  } catch {
    // Product telemetry is best-effort and must never interrupt a user flow.
  }
}

export const trackPublicEvent = trackProductEvent
