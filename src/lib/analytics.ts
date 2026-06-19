import { track } from '@vercel/analytics'
type AnalyticsProperties = Record<string, string | number | boolean | null>

export function trackPublicEvent(name: string, properties?: AnalyticsProperties) {
  track(name, properties)
}
