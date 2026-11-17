import type { GearImportance, GearStatus } from '../hooks/useGear'
// ── Role chips ────────────────────────────────────────────────────────────────

export const ROLE_CHIP: Record<string, { label: string; color: 'primary' | 'success' | 'default' }> = {
  admin:  { label: 'Admin',  color: 'primary' },
  editor: { label: 'Editor', color: 'success' },
  viewer: { label: 'Viewer', color: 'default' },
}

// ── Strategy difficulty ───────────────────────────────────────────────────────

export const DIFFICULTY_CHIP: Record<string, { label: string; color: 'success' | 'warning' | 'danger' }> = {
  easy:   { label: 'Easy',   color: 'success' },
  normal: { label: 'Normal', color: 'warning' },
  hard:   { label: 'Hard',   color: 'danger' },
}

export const DIFFICULTY_OPTIONS = [
  { value: 'easy',   label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard',   label: 'Hard' },
] as const

// ── Map requirement labels ────────────────────────────────────────────────────

export const MAP_REQ_LABELS: Record<string, string> = {
  atlas_drops: 'Atlas Drops',
  more_threads: '+Threads',
  item_quantity: 'Legacy IQ',
  item_rarity:  'IR',
  pack_size:    'Pack Size',
  more_scarabs: 'Legacy +Scarabs',
  more_currency: '+Currency',
  more_unique:  '+Unique',
}

export const MAP_REQ_FIELDS: { key: string; label: string }[] = [
  { key: 'atlas_drops', label: 'Atlas Drops' },
  { key: 'item_rarity',  label: 'Item Rarity' },
  { key: 'pack_size',    label: 'Pack Size' },
  { key: 'more_threads', label: 'More Threads' },
  { key: 'more_currency', label: 'More Currency' },
  { key: 'more_unique',  label: 'More Unique' },
]

// ── Avatar colors ─────────────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  '#f31260', // rose
  '#7828c8', // purple
  '#006FEE', // blue
  '#17c964', // green
  '#f5a524', // amber
  '#e4458f', // pink
  '#0e793c', // emerald
  '#c20e4d', // crimson
  '#338ef7', // sky
  '#9353d3', // violet
  '#45d483', // mint
  '#f9c97c', // peach
] as const

// ── Gear suggestion status ────────────────────────────────────────────────────

export const STATUS_COLOR: Record<GearStatus, 'default' | 'warning' | 'success' | 'danger'> = {
  open:        'warning',
  acknowledged: 'default',
  implemented: 'success',
  dismissed:   'danger',
}

export const IMPORTANCE_CHIP: Record<GearImportance, { label: string; color: 'danger' | 'warning' | 'default' }> = {
  high: { label: 'High', color: 'danger' },
  medium: { label: 'Medium', color: 'warning' },
  low: { label: 'Low', color: 'default' },
}

export const IMPORTANCE_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const
