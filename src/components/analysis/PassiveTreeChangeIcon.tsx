import { Gem, Minus, Plus, type LucideProps } from 'lucide-react'
import type { PassiveTreeDiffKind } from '../../lib/passive-tree-diff'

const icons = { target: Plus, current: Minus, mastery: Gem }

export function PassiveTreeChangeIcon({
  kind,
  ...props
}: LucideProps & { kind: PassiveTreeDiffKind }) {
  const Icon = icons[kind]
  return <Icon {...props} aria-hidden="true" />
}
