import { Button } from '@heroui/react/button'
import { CircleHelp, Clipboard, Diamond, ExternalLink, GitCompareArrows, LocateFixed, WandSparkles, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PassiveTreeSource } from '../../lib/passive-tree-comparison'
import type { PassiveTreeDiffViewModel } from '../../lib/passive-tree-diff'
import { getPassiveTreeSourceAscendancyIds } from '../../lib/passive-tree-layout'
import { getPassiveTreeMasterySelections } from '../../lib/passive-tree-links'
import type { PassiveTreeRenderData, PassiveTreeRenderNode } from '../../lib/passive-tree-render-data'
import { sortUniqueNumbers } from '../../lib/parse-helpers'

type TreeSide = 'Current' | 'Target'
type TreeSourceEntry = { side: TreeSide; source: PassiveTreeSource }
type LocateNode = (nodeId: number) => void

const listClass = 'border-divider mt-2 divide-y divide-divider border-y'

function ReviewGroup({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="py-3">
      <h4 className="text-foreground flex items-center gap-2 text-sm font-medium">
        <Icon size={16} className="text-default-500 shrink-0" aria-hidden="true" />
        {title}
      </h4>
      <p className="text-default-500 mt-1 text-sm">{description}</p>
      {children}
    </div>
  )
}

function ReviewSourceLink({ side, source }: TreeSourceEntry) {
  return source.link ? (
    <a
      href={source.link}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-readable inline-flex min-h-9 items-center gap-1.5 rounded-small text-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-highlight"
    >
      Open {side.toLowerCase()} tree
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  ) : null
}

function ReviewNodeRow({
  label,
  detail,
  node,
  onLocate,
}: {
  label: string
  detail: ReactNode
  node: PassiveTreeRenderNode | undefined
  onLocate: LocateNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-0">
        <p className="text-foreground wrap-break-word text-sm">{label}</p>
        <div className="text-default-500 wrap-break-word mt-0.5 text-xs">{detail}</div>
      </div>
      {node && !node.isProxy ? (
        <Button
          size="sm"
          variant="tertiary"
          aria-label={`Locate on map (${node.label})`}
          onPress={() => onLocate(node.nodeId)}
          className="shrink-0"
        >
          <LocateFixed size={14} aria-hidden="true" /> Locate on map
        </Button>
      ) : null}
    </li>
  )
}

function StartingPointReview({
  sources,
  data,
  differentClasses,
  onLocate,
}: {
  sources: TreeSourceEntry[]
  data: PassiveTreeRenderData
  differentClasses: boolean
  onLocate: LocateNode
}) {
  const nodes = Object.values(data.nodes)
  return (
    <ReviewGroup
      icon={GitCompareArrows}
      title={differentClasses ? 'Different starting classes' : 'Different ascendancies'}
      description="Check the starting point for each route before applying its changes."
    >
      <ul className={listClass}>
        {sources.map((entry) => {
          const { side, source } = entry
          const ascendancyIds = getPassiveTreeSourceAscendancyIds(data, source)
          const node = differentClasses
            ? nodes.find(({ classStartIndex }) => classStartIndex !== null && classStartIndex === source.tree.classId)
            : nodes.find(({ isAscendancyStart, isBloodline, ascendancyName }) =>
                isAscendancyStart && !isBloodline && ascendancyName && ascendancyIds.has(ascendancyName),
              )
          return (
            <ReviewNodeRow
              key={side}
              label={node?.label ?? `${side} tree`}
              detail={node ? side : <ReviewSourceLink {...entry} />}
              node={node}
              onLocate={onLocate}
            />
          )
        })}
      </ul>
    </ReviewGroup>
  )
}

export function PassiveTreeReview({
  current,
  target,
  diff,
  data,
  geometryReview,
  onPasteCurrent,
  onLocate,
}: {
  current: PassiveTreeSource | null
  target: PassiveTreeSource | null
  diff: PassiveTreeDiffViewModel | null
  data: PassiveTreeRenderData | null
  geometryReview: string | null
  onPasteCurrent?: () => void
  onLocate: LocateNode
}) {
  const sources: TreeSourceEntry[] = []
  if (current) sources.push({ side: 'Current', source: current })
  if (target) sources.push({ side: 'Target', source: target })

  const modifiedIds = sortUniqueNumbers(sources.flatMap(({ source }) => source.modifiedNodeIds))
  const unknownIds = new Set(diff?.unknownNodeIds ?? sources.flatMap(({ source }) => source.unresolvedNodeIds))
  const reviewSources = sources.map((entry) => {
    const { source } = entry
    const masterySelections = new Map(getPassiveTreeMasterySelections(source.tree.masteryEffects)
      .map(({ nodeId, effectId }) => [nodeId, effectId]))
    const unmappedIds = data
      ? [...source.tree.hashes, ...masterySelections.keys()].filter((id) => unknownIds.has(id) && !data.nodes[id])
      : []
    return {
      ...entry,
      masterySelections,
      unknown: sortUniqueNumbers([...source.unresolvedNodeIds, ...unmappedIds]),
    }
  })
  const unknownMasteries = diff?.unknownMasteryNodeIds ?? []
  const differentClass = diff?.classMismatch || diff?.ascendancyMismatch
  if (!geometryReview && !modifiedIds.length && !unknownIds.size && !unknownMasteries.length &&
    !differentClass) return null

  return (
    <section aria-label="Needs review" className="border-divider border-t pt-4">
      <h3 className="text-foreground text-sm font-semibold">Needs review</h3>
      <div className="divide-divider max-w-3xl divide-y">
        {geometryReview ? (
          <ReviewGroup icon={GitCompareArrows} title="Tree version or variant" description={geometryReview}>
            {onPasteCurrent ? (
              <p className="text-default-500 mt-1 text-xs">Use a current tree link that matches the target version and variant.</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              {onPasteCurrent ? (
                <Button size="sm" variant="secondary" onPress={onPasteCurrent}>
                  <Clipboard size={14} aria-hidden="true" /> Paste a current tree link
                </Button>
              ) : null}
              {sources.map((entry) => <ReviewSourceLink key={entry.side} {...entry} />)}
            </div>
          </ReviewGroup>
        ) : null}
        {differentClass && data ? (
          <StartingPointReview sources={sources} data={data} differentClasses={diff.classMismatch} onLocate={onLocate} />
        ) : null}
        {modifiedIds.length ? (
          <ReviewGroup
            icon={WandSparkles}
            title="Modified nodes"
            description="The map pin shows the base node. Check its modified stats in Path of Building’s Tree tab or in game."
          >
            <ul className={listClass}>
              {modifiedIds.map((id) => {
                const node = data?.nodes[id]
                const sides = sources.filter(({ source }) => source.modifiedNodeIds.includes(id))
                return (
                  <ReviewNodeRow
                    key={id}
                    label={node?.label ?? `Node ${id}`}
                    detail={`${sides.map(({ side }) => side).join(' and ')}${node ? ` · Node ${id}` : ''}`}
                    node={node}
                    onLocate={onLocate}
                  />
                )
              })}
            </ul>
          </ReviewGroup>
        ) : null}
        {unknownIds.size ? (
          <ReviewGroup
            icon={CircleHelp}
            title="Unknown node IDs"
            description="These saved allocations couldn’t be placed on the map. Check the affected source tree."
          >
            <ul className={listClass}>
              {reviewSources.filter(({ unknown }) => unknown.length > 0).map((entry) => (
                <li key={entry.side} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0">
                    <p className="text-foreground text-sm">{entry.side}</p>
                    <p className="text-default-500 wrap-break-word mt-0.5 text-xs tabular-nums">{entry.unknown.join(', ')}</p>
                  </div>
                  <ReviewSourceLink {...entry} />
                </li>
              ))}
            </ul>
          </ReviewGroup>
        ) : null}
        {unknownMasteries.length ? (
          <ReviewGroup
            icon={Diamond}
            title="Unresolved mastery effects"
            description="Locate each mastery and verify the selected effect in the affected source tree."
          >
            <ul className={listClass}>
              {unknownMasteries.map((id) => {
                const node = data?.nodes[id]
                const detail = reviewSources.flatMap(({ side, masterySelections }) => {
                  const effect = masterySelections.get(id)
                  const allocated = (side === 'Current' ? diff?.currentNodeIds : diff?.targetNodeIds)?.includes(id)
                  if (effect === undefined) return allocated ? [`${side} · No recorded effect`] : []
                  if (node?.masteryEffects.some(({ effectId }) => effectId === effect)) return []
                  return [`${side} · Unrecognized effect ${effect}`]
                })
                return (
                  <ReviewNodeRow
                    key={id}
                    label={node?.label ?? `Node ${id}`}
                    detail={detail.join(' / ')}
                    node={node}
                    onLocate={onLocate}
                  />
                )
              })}
            </ul>
          </ReviewGroup>
        ) : null}
      </div>
    </section>
  )
}
