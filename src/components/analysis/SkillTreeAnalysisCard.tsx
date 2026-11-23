import { Button } from '@heroui/react/button'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import {
  readManualPassiveTree,
  type PassiveTreeSource,
} from '../../lib/passive-tree-comparison'
import { buildPassiveTreeDiffViewModel } from '../../lib/passive-tree-diff'
import { getPassiveTreeComparisonGeometry } from '../../lib/passive-tree-layout'
import {
  loadPassiveTreeRenderData,
  PASSIVE_TREE_GEOMETRY_SOURCE_URL,
  resolvePassiveTreeRenderResolution,
} from '../../lib/passive-tree-render-data'
import { FieldInput } from '../ui/heroui-native'
import { PassiveTreeDiffWorkspace } from './PassiveTreeDiffWorkspace'
import { PassiveTreeReview } from './PassiveTreeReview'

type PassiveTreeSources = { current: PassiveTreeSource | null; target: PassiveTreeSource | null }

const SOURCE_LINK_CLASS = 'text-brand-readable text-xs underline underline-offset-2'
const syncDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function TreeSource({ side, source }: { side: 'Current' | 'Target'; source: PassiveTreeSource | null }) {
  const syncedAt = source?.syncedAt && new Date(source.syncedAt)
  const syncTime = syncedAt && Number.isFinite(syncedAt.valueOf()) ? syncDateFormat.format(syncedAt) : null

  return (
    <div className="min-w-0">
      <dt className="text-default-500 text-xs">{side}</dt>
      <dd className="text-foreground mt-0.5 text-sm font-medium">
        {source?.title ?? 'Unavailable'}
      </dd>
      {source?.detail ? <dd className="text-default-500 mt-0.5 text-xs">{source.detail}</dd> : null}
      {syncTime ? (
        <dd className="text-default-500 mt-0.5 text-xs">
          Synced <time dateTime={source?.syncedAt}>{syncTime}</time>
        </dd>
      ) : null}
      {source?.link ? (
        <dd className="mt-0.5">
          <a href={source.link} target="_blank" rel="noopener noreferrer" className={SOURCE_LINK_CLASS}>
            Open {side.toLowerCase()} tree
          </a>
        </dd>
      ) : null}
    </div>
  )
}

export function SkillTreeSummaryPanel({ current, target }: PassiveTreeSources) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <TreeSource side="Current" source={current} />
      <TreeSource side="Target" source={target} />
    </dl>
  )
}

export function SkillTreeAnalysisPanel({ current: originalCurrent, target }: PassiveTreeSources) {
  const [manualInput, setManualInput] = useState('')
  const [manualSource, setManualSource] = useState<PassiveTreeSource | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
  const [reviewFocus, setReviewFocus] = useState<{ nodeId: number; requestId: number }>()
  const reviewRequestId = useRef(0)
  const manualDetails = useRef<HTMLDetailsElement>(null)
  const manualField = useRef<HTMLInputElement>(null)
  const current = manualSource ?? originalCurrent
  const resolution = current && target ? resolvePassiveTreeRenderResolution(current, target) : null
  const branch = resolution?.branch ?? null
  const geometry = useQuery({
    queryKey: ['passive-tree-geometry', branch],
    queryFn: () => {
      if (!branch) throw new Error('Tree geometry is unavailable for this comparison.')
      return loadPassiveTreeRenderData(branch)
    },
    enabled: branch !== null,
    retry: false,
    staleTime: Infinity,
  })
  const rawGeometry = geometry.data
  const data = useMemo(
    () => current && target && rawGeometry ? getPassiveTreeComparisonGeometry(rawGeometry, current, target) : null,
    [current, target, rawGeometry],
  )
  const diff = useMemo(
    () => current && target && data ? buildPassiveTreeDiffViewModel(current, target, data) : null,
    [current, target, data],
  )
  const canPasteMatchingCurrent = resolution?.supported === false && target &&
    resolvePassiveTreeRenderResolution(target, target).supported

  function openManualInput() {
    if (manualDetails.current) manualDetails.current.open = true
    manualField.current?.focus()
  }

  function locateReviewNode(nodeId: number) {
    reviewRequestId.current += 1
    setReviewFocus({ nodeId, requestId: reviewRequestId.current })
  }

  return (
    <div className="space-y-4">
      {diff && data && current && target ? (
        <PassiveTreeDiffWorkspace
          key={manualSource?.link ?? 'original-tree'}
          diff={diff}
          data={data}
          currentSource={current}
          targetSource={target}
          reviewFocus={reviewFocus}
        />
      ) : (
        <section aria-label="Tree map" className="border-divider bg-content1 rounded-large border p-4">
          {branch && geometry.isFetching ? (
            <p role="status" className="text-default-500 text-sm">Loading official tree geometry…</p>
          ) : (
            <>
              <h3 className="text-foreground text-sm font-semibold">Tree map unavailable</h3>
              {geometry.isError ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p role="alert" className="text-default-500 text-sm">The official tree geometry could not be loaded.</p>
                  <Button size="sm" variant="secondary" onPress={() => void geometry.refetch()}>
                    Retry loading tree map
                  </Button>
                </div>
              ) : null}
              {!current || !target ? (
                <p className="text-default-500 mt-1 text-sm">
                  {!target ? 'The target layout is unavailable.' : 'Use a synced character or paste an official tree link below.'}
                </p>
              ) : null}
            </>
          )}
          <a href={PASSIVE_TREE_GEOMETRY_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={`${SOURCE_LINK_CLASS} mt-2 inline-block`}>
            Official tree export
          </a>
        </section>
      )}

      <PassiveTreeReview
        current={current}
        target={target}
        diff={diff}
        data={data}
        geometryReview={resolution?.supported === false ? resolution.detail : null}
        onPasteCurrent={canPasteMatchingCurrent ? openManualInput : undefined}
        onLocate={locateReviewNode}
      />

      <section aria-label="Tree sources" className="border-divider border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-foreground text-sm font-semibold">Tree sources</h3>
          {resolution?.supported ? <p className="text-default-500 text-xs">{resolution.detail}</p> : null}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <TreeSource side="Current" source={current} />
          <TreeSource side="Target" source={target} />
        </dl>
      </section>

      <details ref={manualDetails} className="border-divider border-t pt-3">
        <summary className="text-brand-readable w-fit cursor-pointer rounded-small px-1 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-highlight">
          Compare another tree
        </summary>
        <form
          className="mt-3 max-w-2xl space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              setManualSource(readManualPassiveTree(manualInput.trim()))
              setManualError(null)
              setReviewFocus(undefined)
            } catch (error) {
              setManualError(error instanceof Error ? error.message : 'Enter an official passive tree link.')
            }
          }}
        >
          <FieldInput
            ref={manualField}
            label="Current tree link"
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder="https://www.pathofexile.com/passive-skill-tree/…"
            errorMessage={manualError ?? undefined}
            isInvalid={manualError !== null}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="secondary" isDisabled={!manualInput.trim()}>
              Apply tree link
            </Button>
            {manualSource ? (
              <Button size="sm" variant="tertiary" onPress={() => {
                setManualSource(null)
                setManualInput('')
                setManualError(null)
                setReviewFocus(undefined)
              }}>
                Use original tree
              </Button>
            ) : null}
          </div>
        </form>
      </details>
    </div>
  )
}
