import { Button } from '@heroui/react/button'
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

type ChangeFilter = 'all' | PassiveTreeDiffKind
const CHANGE_FILTERS: ChangeFilter[] = ['all', 'target', 'current', 'mastery']

function getEffectText(entry: PassiveTreeDiffEntry, effectId: number | null): string {
  if (effectId === null) return 'No effect selected'
  return entry.node.masteryEffects.find((effect) => effect.effectId === effectId)?.text ?? `Effect ${effectId}`
}

function SelectedTreeNode({
  entry,
  currentSource,
  targetSource,
  id,
}: {
  entry: PassiveTreeDiffEntry
  currentSource: PassiveTreeSource
  targetSource: PassiveTreeSource
  id: string
}) {
  const allocationSource = entry.kind === 'target' ? targetSource : currentSource
  return (
    <div id={id} className="border-divider bg-content2 border-t px-3 py-3 text-sm">
      {entry.kind === 'mastery' ? (
        <dl className="space-y-2">
          <div>
            <dt className="text-default-500 text-xs">Current · {currentSource.title}</dt>
            <dd className="whitespace-pre-line">{getEffectText(entry, entry.currentEffect)}</dd>
          </div>
          <div>
            <dt className="text-default-500 text-xs">Target · {targetSource.title}</dt>
            <dd className="whitespace-pre-line">{getEffectText(entry, entry.targetEffect)}</dd>
          </div>
        </dl>
      ) : (
        <>
          <p className="text-default-500 text-xs">{allocationSource.title}</p>
          {entry.node.stats.length ? (
            <ul className="mt-1 space-y-1">
              {entry.node.stats.map((stat, index) => <li key={index}>{stat}</li>)}
            </ul>
          ) : (
            <p className="mt-1">{entry.node.shortStatText ?? 'No base stats in the tree export.'}</p>
          )}
        </>
      )}
      <a
        href={PASSIVE_TREE_GEOMETRY_SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-readable mt-2 inline-block text-xs underline underline-offset-2"
      >
        Node {entry.node.nodeId} · Official tree export
      </a>
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
  const centerOnMap = useRef<((point: { x: number; y: number }) => void) | null>(null)
  const detailId = useId()
  const countsId = useId()
  const entries = filter === 'all' ? diff.entries : diff.entries.filter((entry) => entry.kind === filter)
  const selected = entries.find(({ node }) => node.nodeId === selectedId) ?? null

  function selectEntry(entry: PassiveTreeDiffEntry, fromMap = false) {
    setSelectedId(entry.node.nodeId)
    centerOnMap.current?.(entry.node)
    if (fromMap) {
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
            aria-pressed={kind === filter}
            aria-label={kind === 'all' ? 'All changes' : PASSIVE_TREE_DIFF_LABELS[kind]}
            aria-describedby={kind === 'all' ? undefined : `${countsId}-${kind}`}
            onPress={() => setFilter(kind)}
          >
            {kind === 'all' ? 'All changes' : (
              <>
                <span className={TREE_CHANGE_TONES[kind]}>{PASSIVE_TREE_DIFF_LABELS[kind]}</span>
                <span className="text-foreground tabular-nums" id={`${countsId}-${kind}`}>{diff.counts[kind]}</span>
              </>
            )}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:[--tree-map-height:clamp(240px,calc(100dvh-19.5rem),510px)]">
        <PassiveTreeMap
          data={data}
          diff={diff}
          visibleEntries={entries}
          selected={selected}
          onSelect={(entry) => selectEntry(entry, true)}
          selectionRequest={centerOnMap}
        />
        <section className="min-w-0 lg:flex lg:max-h-[calc(var(--tree-map-height)+2.375rem)] lg:flex-col" aria-label="Tree changes">
          <div className="mb-2 flex min-h-8 items-center justify-between gap-2 px-1">
            <h3 className="text-foreground text-sm font-semibold">Changes</h3>
            <p className="text-default-500 text-xs tabular-nums" aria-live="polite">
              {entries.length} {entries.length === 1 ? 'node' : 'nodes'}
            </p>
          </div>

          {entries.length ? (
            <ul className="border-divider divide-divider overflow-hidden rounded-large border divide-y lg:min-h-0 lg:overflow-y-auto">
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
                      aria-pressed={isSelected}
                      aria-expanded={isSelected}
                      aria-controls={isSelected ? detailId : undefined}
                      onClick={() => selectEntry(entry)}
                      className={`flex min-h-10 w-full flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-3 py-2 text-left text-sm outline-offset-[-2px] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-highlight ${isSelected ? 'bg-selected' : 'bg-content1'}`}
                    >
                      <span className="text-foreground font-medium">{node.label}</span>
                      <span className={`text-xs ${TREE_CHANGE_TONES[kind]}`}>{PASSIVE_TREE_DIFF_LABELS[kind]}</span>
                    </button>
                    {isSelected ? (
                      <SelectedTreeNode entry={entry} currentSource={currentSource} targetSource={targetSource} id={detailId} />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-default-500 border-divider rounded-large border px-3 py-4 text-sm" role="status">
              {filter === 'all' ? 'No base node or mastery differences.' : 'No differences in this filter.'}
            </p>
          )}
        </section>
      </div>
    </>
  )
}
