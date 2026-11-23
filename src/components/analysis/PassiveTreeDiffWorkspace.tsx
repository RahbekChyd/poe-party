import { Button } from '@heroui/react/button'
import { ArrowDown, ArrowRight, Check, Circle, LocateFixed } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import {
  PASSIVE_TREE_DIFF_LABELS,
  TREE_CHANGE_TONES,
  type PassiveTreeDiffEntry,
  type PassiveTreeDiffKind,
  type PassiveTreeDiffViewModel,
} from '../../lib/passive-tree-diff'
import type { PassiveTreeSource } from '../../lib/passive-tree-comparison'
import {
  PASSIVE_TREE_GEOMETRY_SOURCE_URL,
  type PassiveTreeRenderData,
} from '../../lib/passive-tree-render-data'
import { PassiveTreeMap } from './PassiveTreeMap'
import { PassiveTreeChangeIcon } from './PassiveTreeChangeIcon'

type ChangeFilter = 'all' | PassiveTreeDiffKind
const CHANGE_FILTERS: ChangeFilter[] = ['all', 'target', 'current', 'mastery']

function getEffectText(entry: PassiveTreeDiffEntry, effectId: number | null): string {
  if (effectId === null) return 'No effect selected'
  return (
    entry.node.masteryEffects.find((effect) => effect.effectId === effectId)?.text ??
    `Effect ${effectId}`
  )
}

function SelectedTreeNode({
  entry,
  currentSource,
  targetSource,
  id,
  onShowOnMap,
}: {
  entry: PassiveTreeDiffEntry
  currentSource: PassiveTreeSource
  targetSource: PassiveTreeSource
  id: string
  onShowOnMap: () => void
}) {
  const allocationSource = entry.kind === 'target' ? targetSource : currentSource
  const hasCurrentNode = entry.kind === 'current'
  return (
    <div id={id} className="border-divider bg-content2 border-t px-3 py-3 text-sm">
      {entry.kind === 'mastery' ? (
        <div className="space-y-1.5">
          <dl>
            <dt className="text-default-500 text-xs">Current · {currentSource.title}</dt>
            <dd className="whitespace-pre-line">{getEffectText(entry, entry.currentEffect)}</dd>
          </dl>
          <ArrowDown size={14} aria-hidden="true" className="text-default-500" />
          <dl>
            <dt className="text-default-500 text-xs">Target · {targetSource.title}</dt>
            <dd className="whitespace-pre-line">{getEffectText(entry, entry.targetEffect)}</dd>
          </dl>
        </div>
      ) : (
        <>
          <div className="border-divider relative mb-2 rounded-lg border p-2">
            <dl className="grid grid-cols-2 gap-8">
              {(['Current', 'Target'] as const).map((side) => {
                const allocated = side === 'Current' ? hasCurrentNode : !hasCurrentNode
                return (
                  <div key={side}>
                    <dt className="text-default-500 text-xs">{side}</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                      {allocated ? (
                        <Check size={14} aria-hidden="true" className="shrink-0" />
                      ) : (
                        <Circle size={11} aria-hidden="true" className="shrink-0" />
                      )}
                      {allocated ? 'Allocated' : 'Unallocated'}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="text-default-500 absolute bottom-2 left-1/2 -translate-x-1/2"
            />
          </div>
          <p className="text-default-500 text-xs">{allocationSource.title}</p>
          {entry.node.stats.length ? (
            <ul className="mt-1 space-y-1">
              {entry.node.stats.map((stat, index) => (
                <li key={index}>{stat}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">
              {entry.node.shortStatText ?? 'No base stats in the tree export.'}
            </p>
          )}
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2">
        <a
          href={PASSIVE_TREE_GEOMETRY_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-readable text-xs underline underline-offset-2"
        >
          Node {entry.node.nodeId} · Official tree export
        </a>
        <Button size="sm" variant="tertiary" onPress={onShowOnMap} className="lg:hidden">
          <LocateFixed size={14} aria-hidden="true" /> Show on map
        </Button>
      </div>
    </div>
  )
}

export function PassiveTreeDiffWorkspace({
  diff,
  data,
  currentSource,
  targetSource,
}: {
  diff: PassiveTreeDiffViewModel
  data: PassiveTreeRenderData
  currentSource: PassiveTreeSource
  targetSource: PassiveTreeSource
}) {
  const [filter, setFilter] = useState<ChangeFilter>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const entriesRef = useRef(new Map<number, HTMLButtonElement>())
  const focusOnMap = useRef<((point: { x: number; y: number }) => void) | null>(null)
  const detailId = useId()
  const countsId = useId()
  const mapId = useId()
  const entries =
    filter === 'all' ? diff.entries : diff.entries.filter((entry) => entry.kind === filter)
  const selected = entries.find(({ node }) => node.nodeId === selectedId) ?? null

  function selectEntry(entry: PassiveTreeDiffEntry, focusList = false) {
    setSelectedId(entry.node.nodeId)
    focusOnMap.current?.(entry.node)
    if (focusList) {
      const button = entriesRef.current.get(entry.node.nodeId)
      button?.focus({ preventScroll: true })
      button?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  return (
    <>
      <div role="group" aria-label="Filter tree differences" className="flex flex-wrap gap-1.5">
        {CHANGE_FILTERS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kind === filter ? 'secondary' : 'outline'}
            className="max-sm:gap-1 max-sm:px-2"
            aria-pressed={kind === filter}
            aria-label={kind === 'all' ? 'All changes' : PASSIVE_TREE_DIFF_LABELS[kind]}
            aria-describedby={kind === 'all' ? undefined : `${countsId}-${kind}`}
            onPress={() => setFilter(kind)}
          >
            {kind === 'all' ? (
              'All changes'
            ) : (
              <>
                <span className={`flex items-center gap-1.5 ${TREE_CHANGE_TONES[kind]}`}>
                  <PassiveTreeChangeIcon kind={kind} size={13} className="shrink-0" />
                  {PASSIVE_TREE_DIFF_LABELS[kind]}
                </span>
                <span className="text-foreground tabular-nums" id={`${countsId}-${kind}`}>
                  {diff.counts[kind]}
                </span>
              </>
            )}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:[--tree-map-height:clamp(240px,calc(100dvh-19.5rem),510px)]">
        <PassiveTreeMap
          id={mapId}
          data={data}
          diff={diff}
          visibleEntries={entries}
          selected={selected}
          onSelect={selectEntry}
          selectionRequest={focusOnMap}
        />
        <section
          className="min-w-0 lg:flex lg:max-h-[calc(var(--tree-map-height)+2.375rem)] lg:flex-col"
          aria-label="Tree changes"
        >
          <div className="mb-2 flex min-h-8 items-center justify-between gap-2 px-1">
            <h3 className="text-foreground text-sm font-semibold">Changes</h3>
            <p className="text-default-500 text-xs tabular-nums" aria-live="polite">
              {entries.length} {entries.length === 1 ? 'node' : 'nodes'}
            </p>
          </div>

          {entries.length ? (
            <ul className="border-divider divide-divider rounded-large divide-y overflow-hidden border lg:min-h-0 lg:overflow-y-auto">
              {entries.map((entry) => {
                const { node, kind } = entry
                const isSelected = selectedId === node.nodeId
                return (
                  <li key={node.nodeId}>
                    <button
                      ref={(element) => {
                        if (element) entriesRef.current.set(node.nodeId, element)
                        else entriesRef.current.delete(node.nodeId)
                      }}
                      type="button"
                      aria-label={node.label}
                      aria-description={PASSIVE_TREE_DIFF_LABELS[kind]}
                      aria-pressed={isSelected}
                      aria-expanded={isSelected}
                      aria-controls={isSelected ? detailId : undefined}
                      onClick={() => selectEntry(entry)}
                      className={`group hover:bg-surface-hover focus-visible:outline-highlight flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-offset-[-2px] focus-visible:outline-2 ${isSelected ? 'bg-selected' : 'bg-content1'}`}
                    >
                      <span
                        className={`border-control bg-navigation flex size-7 shrink-0 items-center justify-center rounded-full border ${TREE_CHANGE_TONES[kind]}`}
                      >
                        <PassiveTreeChangeIcon kind={kind} size={15} />
                      </span>
                      <span className="text-foreground min-w-0 flex-1 font-medium wrap-anywhere">
                        {node.label}
                      </span>
                      <LocateFixed
                        size={15}
                        aria-hidden="true"
                        className={
                          isSelected
                            ? 'text-highlight shrink-0'
                            : 'text-default-500 group-hover:text-foreground shrink-0'
                        }
                      />
                    </button>
                    {isSelected ? (
                      <SelectedTreeNode
                        entry={entry}
                        currentSource={currentSource}
                        targetSource={targetSource}
                        id={detailId}
                        onShowOnMap={() => {
                          focusOnMap.current?.(node)
                          const map = document.getElementById(mapId)
                          map?.focus({ preventScroll: true })
                          map?.scrollIntoView({ block: 'nearest' })
                        }}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p
              className="text-default-500 border-divider rounded-large border px-3 py-4 text-sm"
              role="status"
            >
              {filter === 'all'
                ? 'No base node or mastery differences.'
                : 'No differences in this filter.'}
            </p>
          )}
        </section>
      </div>
    </>
  )
}
