import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  PassiveTreeDiffEntry,
  PassiveTreeDiffEntryKind,
  PassiveTreeDiffViewModel,
} from '../../lib/passive-tree-diff'
import type {
  PassiveTreeRenderData,
  PassiveTreeRenderNode,
} from '../../lib/passive-tree-render-data'
import {
  formatCompareImpact,
  formatCompareImpactPercent,
  formatCompareSecondaryImpact,
  formatCompareSecondaryImpactPercent,
  type ComparePowerRow,
} from '../../lib/compare-power-report'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
type PassiveTreeDiffWorkspaceProps = {
  viewModel: PassiveTreeDiffViewModel
  renderData: PassiveTreeRenderData | null
  isLoading?: boolean
  isPending?: boolean
  visualUnavailableDetail: string | null
  passiveImpactRows?: ComparePowerRow[]
  passiveImpactMetricLabel?: string | null
}

type DiffFilter = 'all' | PassiveTreeDiffEntryKind

type ViewBox = {
  x: number
  y: number
  width: number
  height: number
}

type DiffMapLabel = {
  entry: PassiveTreeDiffEntry
  offsetX: number
  offsetY: number
  width: number
  height: number
  lines: string[]
  textAnchor: 'start' | 'end'
}

type PanOffset = {
  x: number
  y: number
}

type ViewportSize = {
  width: number
  height: number
}

type ProjectedPassiveImpactNodeBadge = {
  entryKey: string
  left: number
  top: number
  label: string
  toneClassName: string
}

const VISUAL_PANEL_HEIGHT_CLASS = 'xl:h-[540px]'
const MIN_ZOOM_LEVEL = 1
const MAX_ZOOM_LEVEL = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getNodeRadius(node: PassiveTreeRenderNode): number {
  if (node.isKeystone) return 42
  if (node.isNotable) return 32
  if (node.isMastery) return 28
  return 18
}

function buildInteractiveViewBox(
  activeViewBox: ViewBox,
  zoomLevel: number,
  panOffset: PanOffset,
): ViewBox {
  const width = activeViewBox.width / zoomLevel
  const height = activeViewBox.height / zoomLevel
  const baseCenterX = activeViewBox.x + activeViewBox.width / 2
  const baseCenterY = activeViewBox.y + activeViewBox.height / 2
  const minCenterX = activeViewBox.x + width / 2
  const maxCenterX = activeViewBox.x + activeViewBox.width - width / 2
  const minCenterY = activeViewBox.y + height / 2
  const maxCenterY = activeViewBox.y + activeViewBox.height - height / 2
  const centerX = clamp(baseCenterX + panOffset.x, minCenterX, maxCenterX)
  const centerY = clamp(baseCenterY + panOffset.y, minCenterY, maxCenterY)

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  }
}

function buildPanOffsetForCenter(
  baseViewBox: ViewBox,
  zoomLevel: number,
  centerX: number,
  centerY: number,
): PanOffset {
  const width = baseViewBox.width / zoomLevel
  const height = baseViewBox.height / zoomLevel
  const baseCenterX = baseViewBox.x + baseViewBox.width / 2
  const baseCenterY = baseViewBox.y + baseViewBox.height / 2
  const minCenterX = baseViewBox.x + width / 2
  const maxCenterX = baseViewBox.x + baseViewBox.width - width / 2
  const minCenterY = baseViewBox.y + height / 2
  const maxCenterY = baseViewBox.y + baseViewBox.height - height / 2

  return {
    x: clamp(centerX, minCenterX, maxCenterX) - baseCenterX,
    y: clamp(centerY, minCenterY, maxCenterY) - baseCenterY,
  }
}

function getEntryKey(entry: PassiveTreeDiffEntry): string {
  return `${entry.kind}-${entry.nodeId ?? 'meta'}-${entry.label}`
}

function getKindLabel(kind: PassiveTreeDiffEntryKind): string {
  switch (kind) {
    case 'add':
      return 'Add'
    case 'remove':
      return 'Refund'
    case 'mastery_change':
      return 'Mastery changes'
    case 'cluster_review':
      return 'Cluster review'
    case 'version_unavailable':
      return 'Visual diff'
    case 'class_mismatch':
      return 'Class mismatch'
    case 'ascendancy_mismatch':
      return 'Ascendancy mismatch'
    default:
      return 'Differences'
  }
}

function getEntryToneClasses(entry: PassiveTreeDiffEntry): string {
  switch (entry.kind) {
    case 'add':
      return 'border-success/30 bg-success/10'
    case 'remove':
      return 'border-danger/30 bg-danger/10'
    case 'mastery_change':
      return 'border-secondary/30 bg-secondary/10'
    case 'cluster_review':
      return 'border-warning/30 bg-warning/10'
    case 'class_mismatch':
    case 'ascendancy_mismatch':
      return 'border-danger/30 bg-danger/10'
    case 'version_unavailable':
      return 'border-divider/70 bg-default-50/60'
    default:
      return 'border-divider/70 bg-default-50/60'
  }
}

function buildBoundsFromNodeIds(nodeIds: number[], renderData: PassiveTreeRenderData): ViewBox {
  const positions = nodeIds
    .map((nodeId) => renderData.nodes[nodeId])
    .filter((node): node is PassiveTreeRenderNode => !!node)

  if (positions.length === 0) {
    return {
      x: renderData.bounds.minX,
      y: renderData.bounds.minY,
      width: renderData.bounds.maxX - renderData.bounds.minX,
      height: renderData.bounds.maxY - renderData.bounds.minY,
    }
  }

  const minX = Math.min(...positions.map((node) => node.x))
  const maxX = Math.max(...positions.map((node) => node.x))
  const minY = Math.min(...positions.map((node) => node.y))
  const maxY = Math.max(...positions.map((node) => node.y))
  const padding = 900

  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 2200),
    height: Math.max(maxY - minY + padding * 2, 2200),
  }
}

function buildFocusBounds(
  entry: PassiveTreeDiffEntry,
  renderData: PassiveTreeRenderData,
): ViewBox | null {
  if (entry.nodeId == null) return null
  const renderNode = renderData.nodes[entry.nodeId]
  if (!renderNode) return null

  const size = renderNode.isKeystone ? 3000 : renderNode.isNotable ? 2600 : 2200
  return {
    x: renderNode.x - size / 2,
    y: renderNode.y - size / 2,
    width: size,
    height: size,
  }
}

function buildNodePolygon(node: PassiveTreeRenderNode): string {
  const radius = getNodeRadius(node)
  if (node.isKeystone) {
    return [
      `${node.x} ${node.y - radius}`,
      `${node.x + radius} ${node.y}`,
      `${node.x} ${node.y + radius}`,
      `${node.x - radius} ${node.y}`,
    ].join(' ')
  }

  return [
    `${node.x - radius} ${node.y - radius}`,
    `${node.x + radius} ${node.y - radius}`,
    `${node.x + radius} ${node.y + radius}`,
    `${node.x - radius} ${node.y + radius}`,
  ].join(' ')
}

function getNodeTone(entry: PassiveTreeDiffEntry | undefined): {
  fill: string
  stroke: string
  text: string
} {
  if (entry?.kind === 'add') {
    return {
      fill: '#14532d',
      stroke: '#4ade80',
      text: '#dcfce7',
    }
  }

  if (entry?.kind === 'remove') {
    return {
      fill: '#581c1c',
      stroke: '#fb7185',
      text: '#ffe4e6',
    }
  }

  if (entry?.kind === 'mastery_change') {
    return {
      fill: '#312e81',
      stroke: '#818cf8',
      text: '#e0e7ff',
    }
  }

  return {
    fill: '#1f2937',
    stroke: '#94a3b8',
    text: '#e5e7eb',
  }
}

function getLabelText(entry: PassiveTreeDiffEntry): string {
  const action =
    entry.kind === 'add'
      ? '+'
      : entry.kind === 'remove'
        ? '-'
        : entry.kind === 'mastery_change'
          ? '~'
          : ''
  const label = entry.label.trim()
  return `${action} ${label}`.trim()
}

function truncateLabelText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, Math.max(maxLength - 3, 1)).trimEnd()}...`
}

function formatSignedRoundedValue(value: number): string {
  const rounded = Math.round(value)
  const formatted = Math.abs(rounded).toLocaleString()
  if (rounded > 0) return `+${formatted}`
  if (rounded < 0) return `-${formatted}`
  return '0'
}

function getPassiveImpactTone(row: ComparePowerRow): {
  chipClassName: string
  stroke: string
  text: string
} {
  if (row.impact > 0) {
    return {
      chipClassName: 'border-success/30 bg-success/10 text-success-600',
      stroke: '#4ade80',
      text: '#dcfce7',
    }
  }

  if (row.impact < 0) {
    return {
      chipClassName: 'border-danger/30 bg-danger/10 text-danger-600',
      stroke: '#fb7185',
      text: '#ffe4e6',
    }
  }

  return {
    chipClassName: 'border-default-200 bg-default-100 text-default-600',
    stroke: '#cbd5e1',
    text: '#e5e7eb',
  }
}

function formatPassiveImpactDelta(row: ComparePowerRow, metricLabel: string | null | undefined): string {
  const percent = formatCompareImpactPercent(row)
  return `${metricLabel ?? 'Power'} ${formatCompareImpact(row)}${percent ? ` (${percent})` : ''}`
}

function getPassiveImpactEhp(row: ComparePowerRow) {
  return (
    row.secondaryImpacts.totalEhp ??
    Object.values(row.secondaryImpacts).find((impact) => {
      const key = impact.metricKey.toLowerCase()
      const metric = impact.metric?.toLowerCase() ?? ''
      const label = impact.metricLabel.toLowerCase()
      return (
        key === 'totalehp' ||
        key === 'total_ehp' ||
        metric === 'totalehp' ||
        metric === 'total_ehp' ||
        label.includes('effective hit pool') ||
        label === 'ehp'
      )
    }) ??
    null
  )
}

function getPassiveImpactNodeBadgeToneClassName(impact: number | null | undefined): string {
  if (!impact) {
    return 'border-divider bg-content1 text-foreground'
  }
  return impact > 0
    ? 'border-success/50 bg-content1 text-success'
    : 'border-danger/50 bg-content1 text-danger'
}

function formatPassiveImpactEhp(row: ComparePowerRow): string | null {
  const ehpImpact = getPassiveImpactEhp(row)
  const ehpLabel = formatCompareSecondaryImpact(ehpImpact)
  const ehpPercent = formatCompareSecondaryImpactPercent(ehpImpact)
  if (!ehpLabel) return null
  return `EHP ${ehpLabel}${ehpPercent ? ` (${ehpPercent})` : ''}`
}

function getPassiveImpactOverlayLines(
  row: ComparePowerRow,
  metricLabel: string | null | undefined,
): string[] {
  const lines = [formatPassiveImpactDelta(row, metricLabel)]
  const pathDetails = [
    row.perPoint != null ? `${formatSignedRoundedValue(row.perPoint)} per point` : null,
    row.pathDistance != null ? `${Math.round(row.pathDistance).toLocaleString()} path away` : null,
  ].filter((entry): entry is string => entry !== null)

  if (pathDetails.length > 0) {
    lines.push(pathDetails.join(' | '))
  }

  const ehpLabel = formatPassiveImpactEhp(row)
  if (ehpLabel) {
    lines.push(ehpLabel)
  }

  return lines
}

function getEntryLabelLines(
  entry: PassiveTreeDiffEntry,
  passiveImpactRow?: ComparePowerRow,
  passiveImpactMetricLabel?: string | null,
): string[] {
  const lines = [getLabelText(entry)]
  const passiveImpactLines = passiveImpactRow
    ? getPassiveImpactOverlayLines(passiveImpactRow, passiveImpactMetricLabel)
    : []

  if (passiveImpactLines[0]) {
    lines.push(passiveImpactLines[0])
  }

  if (entry.kind === 'mastery_change') {
    if (entry.targetMasteryText) {
      lines.push(`Target: ${truncateLabelText(entry.targetMasteryText, 48)}`)
    }
    if (entry.currentMasteryText) {
      lines.push(`Current: ${truncateLabelText(entry.currentMasteryText, 48)}`)
    }
  } else if (entry.shortStatText) {
    lines.push(truncateLabelText(entry.shortStatText, 48))
  }

  lines.push(...passiveImpactLines.slice(1))

  return lines.slice(0, 5)
}

function getEntryDescriptionLines(entry: PassiveTreeDiffEntry): string[] {
  if (entry.kind === 'mastery_change') {
    const lines: string[] = []
    if (entry.currentMasteryText) {
      lines.push(`Current: ${entry.currentMasteryText}`)
    }
    if (entry.targetMasteryText) {
      lines.push(`Target: ${entry.targetMasteryText}`)
    }
    return lines
  }

  return entry.shortStatText ? entry.shortStatText.split('\n').filter(Boolean) : []
}

function estimateOverlayLabelWidth(lines: string[]): number {
  const longestLineLength = lines.reduce((longest, line) => Math.max(longest, line.length), 0)
  return Math.min(Math.max(longestLineLength * 6.5 + 32, 160), 340)
}

function estimateOverlayLabelHeight(lines: string[]): number {
  const extraLines = Math.max(lines.length - 1, 0)
  return 18 + 16 + extraLines * 14
}

function projectWorldPointToViewport(
  x: number,
  y: number,
  viewBox: ViewBox,
  viewportSize: ViewportSize,
): { x: number; y: number } | null {
  if (
    viewportSize.width <= 0 ||
    viewportSize.height <= 0 ||
    viewBox.width <= 0 ||
    viewBox.height <= 0
  ) {
    return null
  }

  // Account for preserveAspectRatio="xMidYMid meet" (SVG default):
  // the content is uniformly scaled to fit and centered in the viewport.
  const scaleX = viewportSize.width / viewBox.width
  const scaleY = viewportSize.height / viewBox.height
  const scale = Math.min(scaleX, scaleY)

  const renderedWidth = viewBox.width * scale
  const renderedHeight = viewBox.height * scale
  const offsetX = (viewportSize.width - renderedWidth) / 2
  const offsetY = (viewportSize.height - renderedHeight) / 2

  return {
    x: offsetX + ((x - viewBox.x) / viewBox.width) * renderedWidth,
    y: offsetY + ((y - viewBox.y) / viewBox.height) * renderedHeight,
  }
}

function isPathScaffoldNode(node: PassiveTreeRenderNode): boolean {
  return /^Path of the /i.test(node.label.trim())
}

function isClusterJewelSocketNode(node: PassiveTreeRenderNode): boolean {
  const label = node.label.trim()
  return (
    label === 'Large Jewel Socket' ||
    label === 'Medium Jewel Socket' ||
    label === 'Small Jewel Socket'
  )
}

function isOuterSpecialNode(node: PassiveTreeRenderNode): boolean {
  return (
    node.classStartIndex != null ||
    node.isAscendancyStart ||
    node.isMultipleChoice ||
    node.isMultipleChoiceOption ||
    node.isBloodline ||
    isPathScaffoldNode(node)
  )
}

function buildDiffMapLabels(
  entries: PassiveTreeDiffEntry[],
  renderData: PassiveTreeRenderData | null,
  selectedEntryKey: string | null,
  passiveImpactRowsByNodeId: Map<number, ComparePowerRow>,
  passiveImpactMetricLabel: string | null | undefined,
): DiffMapLabel[] {
  if (!renderData) return []

  const positionedEntries = entries
    .filter((entry) => entry.nodeId != null && entry.x != null && entry.y != null)
    .sort((left, right) => {
      const leftSelected = getEntryKey(left) === selectedEntryKey
      const rightSelected = getEntryKey(right) === selectedEntryKey
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1

      if (left.isKeystone !== right.isKeystone) return left.isKeystone ? -1 : 1
      if (left.isNotable !== right.isNotable) return left.isNotable ? -1 : 1
      if (left.isMastery !== right.isMastery) return left.isMastery ? -1 : 1

      return left.label.localeCompare(right.label)
    })
    .slice(0, 12)

  const horizontalOffsets = [180, -180, 220, -220, 260, -260]
  const verticalOffsets = [-120, -70, 70, 120, -180, 180]

  return positionedEntries.map((entry, index) => {
    const passiveImpactRow =
      entry.nodeId != null ? passiveImpactRowsByNodeId.get(entry.nodeId) : undefined
    const lines = getEntryLabelLines(entry, passiveImpactRow, passiveImpactMetricLabel)
    const width = estimateOverlayLabelWidth(lines)
    const height = estimateOverlayLabelHeight(lines)
    const offsetX = horizontalOffsets[index % horizontalOffsets.length]
    const offsetY =
      verticalOffsets[index % verticalOffsets.length] +
      Math.floor(index / horizontalOffsets.length) * 70

    return {
      entry,
      offsetX,
      offsetY,
      width,
      height,
      lines,
      textAnchor: offsetX < 0 ? 'end' : 'start',
    }
  })
}

function shouldHideOuterConnector(
  renderData: PassiveTreeRenderData,
  fromNodeId: number,
  toNodeId: number,
): boolean {
  const fromNode = renderData.nodes[fromNodeId]
  const toNode = renderData.nodes[toNodeId]
  if (!fromNode || !toNode) return false

  const fromGroup = renderData.groups[fromNode.groupId]
  const toGroup = renderData.groups[toNode.groupId]
  const fromTouchesProxy = fromGroup?.isProxy === true || fromNode.isProxy
  const toTouchesProxy = toGroup?.isProxy === true || toNode.isProxy
  const clusterJewelConnector =
    (isClusterJewelSocketNode(fromNode) && (isClusterJewelSocketNode(toNode) || toTouchesProxy)) ||
    (isClusterJewelSocketNode(toNode) && (isClusterJewelSocketNode(fromNode) || fromTouchesProxy))

  if (clusterJewelConnector) {
    return false
  }

  const touchesProxyGroup = fromGroup?.isProxy === true || toGroup?.isProxy === true
  const touchesProxyNode = fromNode.isProxy || toNode.isProxy
  const touchesOuterSpecialNode = isOuterSpecialNode(fromNode) || isOuterSpecialNode(toNode)

  return touchesProxyGroup || touchesProxyNode || touchesOuterSpecialNode
}

function groupEntries(entries: PassiveTreeDiffEntry[]): Array<{
  kind: PassiveTreeDiffEntryKind
  entries: PassiveTreeDiffEntry[]
}> {
  const grouped = new Map<PassiveTreeDiffEntryKind, PassiveTreeDiffEntry[]>()
  for (const entry of entries) {
    const bucket = grouped.get(entry.kind) ?? []
    bucket.push(entry)
    grouped.set(entry.kind, bucket)
  }

  return [...grouped.entries()].map(([kind, groupedEntries]) => ({
    kind,
    entries: groupedEntries,
  }))
}

function sortAddEntriesByPerPoint(
  entries: PassiveTreeDiffEntry[],
  passiveImpactRowsByNodeId: Map<number, ComparePowerRow>,
): PassiveTreeDiffEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftImpact =
        left.entry.nodeId != null ? passiveImpactRowsByNodeId.get(left.entry.nodeId) : undefined
      const rightImpact =
        right.entry.nodeId != null ? passiveImpactRowsByNodeId.get(right.entry.nodeId) : undefined
      const leftPerPoint = leftImpact?.perPoint
      const rightPerPoint = rightImpact?.perPoint

      if (leftPerPoint != null || rightPerPoint != null) {
        if (leftPerPoint == null) return 1
        if (rightPerPoint == null) return -1
        if (leftPerPoint !== rightPerPoint) return rightPerPoint - leftPerPoint
      }

      const leftImpactValue = Math.abs(leftImpact?.impact ?? 0)
      const rightImpactValue = Math.abs(rightImpact?.impact ?? 0)
      if (leftImpactValue !== rightImpactValue) return rightImpactValue - leftImpactValue

      return left.index - right.index
    })
    .map(({ entry }) => entry)
}

function sortGroupedEntriesForDisplay(
  groups: ReturnType<typeof groupEntries>,
  passiveImpactRowsByNodeId: Map<number, ComparePowerRow>,
): ReturnType<typeof groupEntries> {
  return groups.map((group) =>
    group.kind === 'add'
      ? {
          ...group,
          entries: sortAddEntriesByPerPoint(group.entries, passiveImpactRowsByNodeId),
        }
      : group,
  )
}

function getPassiveImpactNodeBadge(
  row: ComparePowerRow,
  metricLabel: string | null | undefined,
): {
  label: string
  toneClassName: string
} | null {
  const primaryPercent = formatCompareImpactPercent(row)
  const primaryLabel = `${metricLabel ?? 'DPS'} ${primaryPercent ?? formatCompareImpact(row)}`
  const ehpImpact = getPassiveImpactEhp(row)
  const ehpPercent = formatCompareSecondaryImpactPercent(ehpImpact)
  const ehpLabel = formatCompareSecondaryImpact(ehpImpact)
  const shouldUseEhp =
    !!ehpImpact &&
    !!(ehpPercent ?? ehpLabel) &&
    ((row.impactPercent != null &&
      ehpImpact.impactPercent != null &&
      ehpImpact.impactPercent > row.impactPercent) ||
      (row.impactPercent == null &&
        ehpImpact.impactPercent != null &&
        ehpImpact.impactPercent > 0))

  if (shouldUseEhp) {
    return {
      label: `EHP ${ehpPercent ?? ehpLabel}`,
      toneClassName: getPassiveImpactNodeBadgeToneClassName(ehpImpact.impact),
    }
  }

  return {
    label: primaryLabel,
    toneClassName: getPassiveImpactNodeBadgeToneClassName(row.impact),
  }
}

function PassiveImpactChips({
  row,
  metricLabel,
}: {
  row: ComparePowerRow
  metricLabel: string | null | undefined
}) {
  const tone = getPassiveImpactTone(row)
  const ehpImpact = getPassiveImpactEhp(row)
  const ehpLabel = formatPassiveImpactEhp(row)

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <Chip size="sm" variant="soft" className={`border ${tone.chipClassName}`}>
        {formatPassiveImpactDelta(row, metricLabel)}
      </Chip>
      {row.perPoint != null ? (
        <Chip size="sm" variant="soft">
          {formatSignedRoundedValue(row.perPoint)} per point
        </Chip>
      ) : null}
      {row.pathDistance != null ? (
        <Chip size="sm" variant="soft">
          {Math.round(row.pathDistance).toLocaleString()} path away
        </Chip>
      ) : null}
      {ehpLabel ? (
        <Chip
          size="sm"
          variant="soft"
          color={ehpImpact && ehpImpact.impact >= 0 ? 'success' : 'danger'}
        >
          {ehpLabel}
        </Chip>
      ) : null}
    </div>
  )
}

export function PassiveTreeDiffWorkspace({
  viewModel,
  renderData,
  isLoading,
  isPending = false,
  visualUnavailableDetail,
  passiveImpactRows = [],
  passiveImpactMetricLabel = null,
}: PassiveTreeDiffWorkspaceProps) {
  const loading = isLoading || isPending
  const [showContext] = useState(true)
  const [activeFilter, setActiveFilter] = useState<DiffFilter>('all')
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'default' | 'differences' | 'selected'>('default')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [interactiveViewBox, setInteractiveViewBox] = useState<ViewBox | null>(null)
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 })
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
  } | null>(null)
  const zoomLevelRef = useRef(1)
  const panOffsetRef = useRef<PanOffset>({ x: 0, y: 0 })
  const activeViewBoxRef = useRef<ViewBox | null>(null)
  const rafHandleRef = useRef<number | null>(null)
  const pendingZoomSyncRef = useRef(false)

  const filterCounts = useMemo(
    () => ({
      add: viewModel.counts.add,
      remove: viewModel.counts.remove,
      mastery_change: viewModel.counts.masteryChange,
      cluster_review: viewModel.counts.clusterReview,
    }),
    [viewModel.counts],
  )

  const filteredEntries = useMemo(() => {
    if (activeFilter === 'all') return viewModel.entries
    return viewModel.entries.filter((entry) => entry.kind === activeFilter)
  }, [activeFilter, viewModel.entries])

  const selectedEntry = useMemo(() => {
    if (!selectedEntryKey) return null

    return (
      [...viewModel.warningEntries, ...viewModel.entries].find(
        (entry) => getEntryKey(entry) === selectedEntryKey,
      ) ?? null
    )
  }, [selectedEntryKey, viewModel.entries, viewModel.warningEntries])

  const passiveImpactRowsByNodeId = useMemo(() => {
    const actionableNodeIds = new Set(
      viewModel.entries
        .map((entry) => entry.nodeId)
        .filter((nodeId): nodeId is number => nodeId != null),
    )
    const rowsByNodeId = new Map<number, ComparePowerRow>()

    for (const row of passiveImpactRows) {
      if (row.nodeId == null || !actionableNodeIds.has(row.nodeId)) continue

      const current = rowsByNodeId.get(row.nodeId)
      if (!current || Math.abs(row.impact) > Math.abs(current.impact)) {
        rowsByNodeId.set(row.nodeId, row)
      }
    }

    return rowsByNodeId
  }, [passiveImpactRows, viewModel.entries])

  useEffect(() => {
    // Clear stale key if the entry no longer exists
    if (selectedEntryKey && !selectedEntry) {
      setSelectedEntryKey(null)
    }
  }, [selectedEntry, selectedEntryKey])

  useEffect(() => {
    setViewMode('default')
  }, [showContext, activeFilter])

  const currentNodeIdSet = useMemo(
    () => new Set(viewModel.currentNodeIds),
    [viewModel.currentNodeIds],
  )
  const targetNodeIdSet = useMemo(() => new Set(viewModel.targetNodeIds), [viewModel.targetNodeIds])
  const selectedNodeIdSet = useMemo(
    () => new Set([...viewModel.currentNodeIds, ...viewModel.targetNodeIds]),
    [viewModel.currentNodeIds, viewModel.targetNodeIds],
  )
  const changedNodeIdSet = useMemo(
    () => new Set(viewModel.changedNodeIds),
    [viewModel.changedNodeIds],
  )

  const renderedNodeIds = useMemo(() => {
    if (!renderData) return []
    const selectedIds = [...selectedNodeIdSet].filter((nodeId) => !!renderData.nodes[nodeId])
    if (selectedIds.length > 0) return selectedIds
    return viewModel.changedNodeIds.filter((nodeId) => !!renderData.nodes[nodeId])
  }, [renderData, selectedNodeIdSet, viewModel.changedNodeIds])

  const renderedNodeIdSet = useMemo(() => new Set(renderedNodeIds), [renderedNodeIds])
  const focusedNodeIds = useMemo(() => {
    if (!renderData) return []
    if (showContext || viewModel.changedNodeIds.length === 0) return renderedNodeIds
    return viewModel.changedNodeIds.filter((nodeId) => !!renderData.nodes[nodeId])
  }, [renderData, renderedNodeIds, showContext, viewModel.changedNodeIds])
  const allRenderNodes = useMemo(() => {
    if (!renderData) return []

    return Object.values(renderData.nodes).sort((left, right) => {
      const leftChanged = changedNodeIdSet.has(left.nodeId)
      const rightChanged = changedNodeIdSet.has(right.nodeId)
      if (leftChanged !== rightChanged) return leftChanged ? -1 : 1

      const leftSelected = selectedNodeIdSet.has(left.nodeId)
      const rightSelected = selectedNodeIdSet.has(right.nodeId)
      if (leftSelected !== rightSelected) return leftSelected ? 1 : -1

      return getNodeRadius(left) - getNodeRadius(right)
    })
  }, [changedNodeIdSet, renderData, selectedNodeIdSet])

  const defaultBounds = useMemo(() => {
    if (!renderData) return null
    return buildBoundsFromNodeIds(focusedNodeIds, renderData)
  }, [focusedNodeIds, renderData])

  const differenceBounds = useMemo(() => {
    if (!renderData) return null
    const differenceNodeIds =
      viewModel.changedNodeIds.length > 0 ? viewModel.changedNodeIds : focusedNodeIds
    return buildBoundsFromNodeIds(differenceNodeIds, renderData)
  }, [focusedNodeIds, renderData, viewModel.changedNodeIds])

  const selectedBounds = useMemo(() => {
    if (!renderData || !selectedEntry) return null
    return buildFocusBounds(selectedEntry, renderData)
  }, [renderData, selectedEntry])

  const selectedBaseBounds = useMemo(() => {
    if (showContext) return defaultBounds ?? differenceBounds
    return differenceBounds ?? defaultBounds
  }, [defaultBounds, differenceBounds, showContext])

  const activeViewBox = useMemo(() => {
    if (viewMode === 'selected' && selectedBaseBounds) return selectedBaseBounds
    if (viewMode === 'differences' && differenceBounds) return differenceBounds
    return defaultBounds
  }, [defaultBounds, differenceBounds, selectedBaseBounds, viewMode])

  const applyInteractiveViewBox = useCallback((syncZoomState = false) => {
    const baseViewBox = activeViewBoxRef.current
    const svgElement = svgRef.current
    if (!baseViewBox || !svgElement) return

    const nextViewBox = buildInteractiveViewBox(
      baseViewBox,
      zoomLevelRef.current,
      panOffsetRef.current,
    )
    svgElement.setAttribute(
      'viewBox',
      `${nextViewBox.x} ${nextViewBox.y} ${nextViewBox.width} ${nextViewBox.height}`,
    )
    setInteractiveViewBox(nextViewBox)

    if (syncZoomState || pendingZoomSyncRef.current) {
      pendingZoomSyncRef.current = false
      setZoomLevel(zoomLevelRef.current)
    }
  }, [])

  const scheduleInteractiveViewBox = useCallback(
    (syncZoomState = false) => {
      if (syncZoomState) {
        pendingZoomSyncRef.current = true
      }
      if (rafHandleRef.current != null) return

      rafHandleRef.current = requestAnimationFrame(() => {
        rafHandleRef.current = null
        applyInteractiveViewBox(syncZoomState)
      })
    },
    [applyInteractiveViewBox],
  )

  const changeZoom = useCallback(
    (factor: number, ratioX = 0.5, ratioY = 0.5) => {
      const baseViewBox = activeViewBoxRef.current
      if (!baseViewBox) return
      const currentZoom = zoomLevelRef.current
      const nextZoom = clamp(currentZoom * factor, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL)
      if (nextZoom === currentZoom) return

      const currentViewBox = buildInteractiveViewBox(baseViewBox, currentZoom, panOffsetRef.current)
      const centerX = currentViewBox.x + ratioX * currentViewBox.width -
        (ratioX - 0.5) * (baseViewBox.width / nextZoom)
      const centerY = currentViewBox.y + ratioY * currentViewBox.height -
        (ratioY - 0.5) * (baseViewBox.height / nextZoom)
      zoomLevelRef.current = nextZoom
      panOffsetRef.current = buildPanOffsetForCenter(baseViewBox, nextZoom, centerX, centerY)
      if (nextZoom <= MIN_ZOOM_LEVEL) {
        setSelectedEntryKey(null)
        setViewMode('default')
      }
      scheduleInteractiveViewBox(true)
    },
    [scheduleInteractiveViewBox],
  )

  const handleViewportWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.deltaY === 0) return
      const viewportElement = mapViewportRef.current
      if (!viewportElement) return

      const rect = viewportElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      event.preventDefault()
      const ratioX = clamp((event.clientX - rect.left) / rect.width, 0, 1)
      const ratioY = clamp((event.clientY - rect.top) / rect.height, 0, 1)
      changeZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, ratioX, ratioY)
    },
    [changeZoom],
  )

  useEffect(() => {
    activeViewBoxRef.current = activeViewBox
    zoomLevelRef.current = 1
    panOffsetRef.current = { x: 0, y: 0 }
    pendingZoomSyncRef.current = false
    setZoomLevel(1)
    if (!activeViewBox) {
      setInteractiveViewBox(null)
      return
    }
    applyInteractiveViewBox()
  }, [activeViewBox, applyInteractiveViewBox])

  useEffect(() => {
    if (viewMode !== 'selected' || !activeViewBox || !selectedBounds) return

    const focusCenterX = selectedBounds.x + selectedBounds.width / 2
    const focusCenterY = selectedBounds.y + selectedBounds.height / 2
    const nextZoom = clamp(
      Math.min(
        activeViewBox.width / selectedBounds.width,
        activeViewBox.height / selectedBounds.height,
      ),
      MIN_ZOOM_LEVEL,
      MAX_ZOOM_LEVEL,
    )

    activeViewBoxRef.current = activeViewBox
    zoomLevelRef.current = nextZoom
    panOffsetRef.current = buildPanOffsetForCenter(
      activeViewBox,
      nextZoom,
      focusCenterX,
      focusCenterY,
    )
    pendingZoomSyncRef.current = false
    setZoomLevel(nextZoom)
    applyInteractiveViewBox()
  }, [activeViewBox, applyInteractiveViewBox, selectedBounds, viewMode])

  useEffect(
    () => () => {
      if (rafHandleRef.current != null) {
        cancelAnimationFrame(rafHandleRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const viewportElement = mapViewportRef.current
    if (!viewportElement || !activeViewBox) return

    viewportElement.addEventListener('wheel', handleViewportWheel, { passive: false })
    return () => {
      viewportElement.removeEventListener('wheel', handleViewportWheel)
    }
  }, [activeViewBox, handleViewportWheel])

  useEffect(() => {
    const viewportElement = mapViewportRef.current
    if (!viewportElement) {
      setViewportSize({ width: 0, height: 0 })
      return
    }

    const updateViewportSize = () => {
      const nextSize = {
        width: viewportElement.clientWidth,
        height: viewportElement.clientHeight,
      }

      setViewportSize((currentSize) =>
        currentSize.width === nextSize.width && currentSize.height === nextSize.height
          ? currentSize
          : nextSize,
      )
    }

    updateViewportSize()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      updateViewportSize()
    })
    observer.observe(viewportElement)

    return () => {
      observer.disconnect()
    }
  }, [activeViewBox])

  const connectorRows = useMemo(() => {
    if (!renderData) return []

    return renderData.connectors
      .filter(
        (connector) =>
          renderedNodeIdSet.has(connector.fromNodeId) &&
          renderedNodeIdSet.has(connector.toNodeId) &&
          !shouldHideOuterConnector(renderData, connector.fromNodeId, connector.toNodeId),
      )
      .map((connector) => {
        const fromNode = renderData.nodes[connector.fromNodeId]
        const toNode = renderData.nodes[connector.toNodeId]
        if (!fromNode || !toNode) return null

        const currentActive =
          currentNodeIdSet.has(connector.fromNodeId) && currentNodeIdSet.has(connector.toNodeId)
        const targetActive =
          targetNodeIdSet.has(connector.fromNodeId) && targetNodeIdSet.has(connector.toNodeId)

        if (!showContext && currentActive === targetActive) {
          return null
        }

        const colorClass =
          targetActive && !currentActive
            ? 'stroke-success/80'
            : currentActive && !targetActive
              ? 'stroke-danger/80'
              : 'stroke-default-400/40'

        return {
          id: connector.id,
          x1: fromNode.x,
          y1: fromNode.y,
          x2: toNode.x,
          y2: toNode.y,
          colorClass,
          emphasized: currentActive !== targetActive,
        }
      })
      .filter(
        (
          connector,
        ): connector is {
          id: string
          x1: number
          y1: number
          x2: number
          y2: number
          colorClass: string
          emphasized: boolean
        } => connector != null,
      )
  }, [currentNodeIdSet, renderData, renderedNodeIdSet, showContext, targetNodeIdSet])

  const backgroundConnectorRows = useMemo(() => {
    if (!renderData) return []

    return renderData.connectors
      .filter(
        (connector) =>
          !shouldHideOuterConnector(renderData, connector.fromNodeId, connector.toNodeId),
      )
      .map((connector) => {
        const fromNode = renderData.nodes[connector.fromNodeId]
        const toNode = renderData.nodes[connector.toNodeId]
        if (!fromNode || !toNode) return null

        const currentActive =
          currentNodeIdSet.has(connector.fromNodeId) && currentNodeIdSet.has(connector.toNodeId)
        const targetActive =
          targetNodeIdSet.has(connector.fromNodeId) && targetNodeIdSet.has(connector.toNodeId)
        const sharedActive = currentActive && targetActive
        const eitherActive = currentActive || targetActive

        return {
          id: connector.id,
          x1: fromNode.x,
          y1: fromNode.y,
          x2: toNode.x,
          y2: toNode.y,
          stroke: sharedActive ? '#f2daa1' : eitherActive ? '#7d6840' : '#334155',
          opacity: sharedActive ? (showContext ? 0.72 : 0.6) : eitherActive ? 0.34 : 0.24,
          strokeWidth: sharedActive ? 14 : eitherActive ? 9 : 6,
        }
      })
      .filter(
        (
          connector,
        ): connector is {
          id: string
          x1: number
          y1: number
          x2: number
          y2: number
          stroke: string
          opacity: number
          strokeWidth: number
        } => connector != null,
      )
  }, [currentNodeIdSet, renderData, showContext, targetNodeIdSet])

  const nodeEntriesById = useMemo(
    () =>
      new Map(
        viewModel.entries
          .filter((entry) => entry.nodeId != null)
          .map((entry) => [entry.nodeId!, entry] as const),
      ),
    [viewModel.entries],
  )

  const renderedNodes = useMemo(() => {
    if (!renderData) return []

    return renderedNodeIds
      .map((nodeId) => renderData.nodes[nodeId])
      .filter((node): node is PassiveTreeRenderNode => !!node)
      .sort((left, right) => {
        const leftChanged = changedNodeIdSet.has(left.nodeId)
        const rightChanged = changedNodeIdSet.has(right.nodeId)
        if (leftChanged !== rightChanged) return leftChanged ? 1 : -1
        return getNodeRadius(left) - getNodeRadius(right)
      })
  }, [changedNodeIdSet, renderData, renderedNodeIds])

  const diffMapLabelEntries = useMemo(() => {
    if (selectedEntry?.nodeId != null) return [selectedEntry]
    return []
  }, [selectedEntry])

  const diffMapLabels = useMemo(
    () =>
      buildDiffMapLabels(
        diffMapLabelEntries,
        renderData,
        selectedEntryKey,
        passiveImpactRowsByNodeId,
        passiveImpactMetricLabel,
      ),
    [
      diffMapLabelEntries,
      renderData,
      selectedEntryKey,
      passiveImpactRowsByNodeId,
      passiveImpactMetricLabel,
    ],
  )

  const projectedDiffMapLabels = useMemo(() => {
    if (!interactiveViewBox || viewportSize.width <= 0 || viewportSize.height <= 0) return []

    return diffMapLabels
      .map((label) => {
        const nodeX = label.entry.x
        const nodeY = label.entry.y
        if (nodeX == null || nodeY == null) return null

        const nodePoint = projectWorldPointToViewport(
          nodeX,
          nodeY,
          interactiveViewBox,
          viewportSize,
        )
        if (!nodePoint) return null

        if (
          nodePoint.x < -120 ||
          nodePoint.x > viewportSize.width + 120 ||
          nodePoint.y < -120 ||
          nodePoint.y > viewportSize.height + 120
        ) {
          return null
        }

        // Dampen offsets at higher zoom so labels stay proportional to visible node spacing
        const offsetScale = 1 / Math.pow(zoomLevel, 0.35)
        const desiredAnchorX = nodePoint.x + label.offsetX * offsetScale
        const desiredAnchorY = nodePoint.y + label.offsetY * offsetScale
        const minLeft = 12
        const maxLeft = Math.max(minLeft, viewportSize.width - label.width - 12)
        const minTop = 12
        const maxTop = Math.max(minTop, viewportSize.height - label.height - 12)
        const desiredLeft =
          label.textAnchor === 'start' ? desiredAnchorX : desiredAnchorX - label.width
        const left = clamp(desiredLeft, minLeft, maxLeft)
        const top = clamp(desiredAnchorY - label.height / 2, minTop, maxTop)

        return {
          label,
          nodeX: nodePoint.x,
          nodeY: nodePoint.y,
          anchorX: label.textAnchor === 'start' ? left : left + label.width,
          anchorY: top + label.height / 2,
          left,
          top,
        }
      })
      .filter(
        (
          label,
        ): label is {
          label: DiffMapLabel
          nodeX: number
          nodeY: number
          anchorX: number
          anchorY: number
          left: number
          top: number
        } => label != null,
      )
  }, [diffMapLabels, interactiveViewBox, viewportSize, zoomLevel])

  const projectedPassiveImpactNodeBadges = useMemo((): ProjectedPassiveImpactNodeBadge[] => {
    if (!interactiveViewBox || viewportSize.width <= 0 || viewportSize.height <= 0) return []

    return renderedNodes
      .map((node) => {
        const entry = nodeEntriesById.get(node.nodeId)
        const row = passiveImpactRowsByNodeId.get(node.nodeId)
        if (!entry || !row) return null

        const badge = getPassiveImpactNodeBadge(row, passiveImpactMetricLabel)
        if (!badge) return null

        const nodePoint = projectWorldPointToViewport(
          node.x,
          node.y,
          interactiveViewBox,
          viewportSize,
        )
        if (!nodePoint) return null
        if (
          nodePoint.x < -80 ||
          nodePoint.x > viewportSize.width + 80 ||
          nodePoint.y < -80 ||
          nodePoint.y > viewportSize.height + 80
        ) {
          return null
        }

        const width = Math.min(Math.max(badge.label.length * 6.25 + 20, 56), 120)
        const left = clamp(nodePoint.x + 10, 8, Math.max(8, viewportSize.width - width - 8))
        const top = clamp(nodePoint.y - 26, 8, Math.max(8, viewportSize.height - 24))

        return {
          entryKey: getEntryKey(entry),
          left,
          top,
          label: badge.label,
          toneClassName: badge.toneClassName,
        }
      })
      .filter((badge): badge is ProjectedPassiveImpactNodeBadge => badge != null)
  }, [
    interactiveViewBox,
    nodeEntriesById,
    passiveImpactMetricLabel,
    passiveImpactRowsByNodeId,
    renderedNodes,
    viewportSize,
  ])

  const mapSvg = useMemo(() => {
    if (!activeViewBox) return null

    return (
      <svg
        ref={svgRef}
        viewBox={`${activeViewBox.x} ${activeViewBox.y} ${activeViewBox.width} ${activeViewBox.height}`}
        className="h-[540px] w-full"
      >
        <g>
          <rect
            x={activeViewBox.x}
            y={activeViewBox.y}
            width={activeViewBox.width}
            height={activeViewBox.height}
            fill="transparent"
            data-pan-surface="true"
          />

          {backgroundConnectorRows.map((connector) => (
            <line
              key={`backdrop-${connector.id}`}
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
              stroke={connector.stroke}
              strokeOpacity={connector.opacity}
              strokeWidth={connector.strokeWidth}
              strokeLinecap="round"
            />
          ))}

          {connectorRows.map((connector) => (
            <line
              key={connector.id}
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
              className={`${connector.colorClass} fill-none`}
              strokeWidth={connector.emphasized ? 16 : 10}
              strokeLinecap="round"
            />
          ))}

          {allRenderNodes.map((node) => {
            const isChanged = changedNodeIdSet.has(node.nodeId)
            const isSelected = selectedNodeIdSet.has(node.nodeId)
            const isShared = currentNodeIdSet.has(node.nodeId) && targetNodeIdSet.has(node.nodeId)
            const baseFill = isSelected ? '#0f172a' : '#020617'
            const baseStroke = isShared ? '#9f8652' : isSelected ? '#5e5132' : '#1f2937'
            const baseOpacity = isChanged
              ? 0.24
              : isShared
                ? showContext
                  ? 0.28
                  : 0.24
                : isSelected
                  ? 0.22
                  : 0.24
            const strokeOpacity = isChanged ? 0.42 : isShared ? 0.68 : isSelected ? 0.46 : 0.4

            return node.isKeystone ? (
              <polygon
                key={`backdrop-node-${node.nodeId}`}
                points={buildNodePolygon(node)}
                fill={baseFill}
                fillOpacity={baseOpacity}
                stroke={baseStroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={4}
              />
            ) : node.isMastery ? (
              <rect
                key={`backdrop-node-${node.nodeId}`}
                x={node.x - getNodeRadius(node)}
                y={node.y - getNodeRadius(node)}
                width={getNodeRadius(node) * 2}
                height={getNodeRadius(node) * 2}
                rx={10}
                fill={baseFill}
                fillOpacity={baseOpacity}
                stroke={baseStroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={4}
              />
            ) : (
              <circle
                key={`backdrop-node-${node.nodeId}`}
                cx={node.x}
                cy={node.y}
                r={getNodeRadius(node)}
                fill={baseFill}
                fillOpacity={baseOpacity}
                stroke={baseStroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={4}
              />
            )
          })}

          {renderedNodes.map((node) => {
            const entry = nodeEntriesById.get(node.nodeId)
            const isSelected = entry && selectedEntryKey === getEntryKey(entry)
            const isShared = currentNodeIdSet.has(node.nodeId) && targetNodeIdSet.has(node.nodeId)
            const passiveImpactRow = passiveImpactRowsByNodeId.get(node.nodeId)
            const passiveImpactTone = passiveImpactRow ? getPassiveImpactTone(passiveImpactRow) : null
            const tone = entry
              ? getNodeTone(entry)
              : isShared
                ? {
                    fill: '#3d3113',
                    stroke: '#f5df9d',
                    text: '#fef3c7',
                  }
                : {
                    fill: '#1f2937',
                    stroke: '#94a3b8',
                    text: '#e5e7eb',
                  }

            return (
              <g
                key={node.nodeId}
                data-node-entry="true"
                onClick={() => {
                  const clickedEntry = nodeEntriesById.get(node.nodeId)
                  if (!clickedEntry) return
                  const clickedKey = getEntryKey(clickedEntry)
                  if (selectedEntryKey === clickedKey) {
                    setSelectedEntryKey(null)
                    setViewMode('default')
                  } else {
                    setSelectedEntryKey(clickedKey)
                    setViewMode('selected')
                  }
                }}
                className={entry ? 'cursor-pointer' : undefined}
              >
                {isSelected ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={getNodeRadius(node) + 12}
                    fill="none"
                    stroke="#f8fafc"
                    strokeOpacity={0.8}
                    strokeWidth={6}
                    className="animate-pulse"
                  />
                ) : null}

                {entry ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={getNodeRadius(node) + 16}
                    fill={
                      entry.kind === 'add'
                        ? 'rgba(74, 222, 128, 0.16)'
                        : entry.kind === 'remove'
                          ? 'rgba(251, 113, 133, 0.16)'
                          : 'rgba(129, 140, 248, 0.16)'
                    }
                  />
                ) : isShared ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={getNodeRadius(node) + 10}
                    fill="rgba(245, 223, 157, 0.14)"
                  />
                ) : null}

                {passiveImpactTone ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={getNodeRadius(node) + 26}
                    fill="none"
                    stroke={passiveImpactTone.stroke}
                    strokeOpacity={0.78}
                    strokeWidth={5}
                    strokeDasharray="18 12"
                  />
                ) : null}

                {node.isKeystone ? (
                  <polygon
                    points={buildNodePolygon(node)}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={7}
                  />
                ) : node.isMastery ? (
                  <rect
                    x={node.x - getNodeRadius(node)}
                    y={node.y - getNodeRadius(node)}
                    width={getNodeRadius(node) * 2}
                    height={getNodeRadius(node) * 2}
                    rx={10}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={7}
                  />
                ) : (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={getNodeRadius(node)}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={7}
                  />
                )}
                {entry ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={Math.max(getNodeRadius(node) * 0.22, 4)}
                    fill={tone.stroke}
                    opacity={0.92}
                  />
                ) : null}
                <title>
                  {entry
                    ? [
                        node.label,
                        ...(passiveImpactRow
                          ? getPassiveImpactOverlayLines(
                              passiveImpactRow,
                              passiveImpactMetricLabel,
                            )
                          : []),
                        ...getEntryDescriptionLines(entry),
                      ].join('\n')
                    : node.label}
                </title>
              </g>
            )
          })}
        </g>
      </svg>
    )
  }, [
    activeViewBox,
    allRenderNodes,
    backgroundConnectorRows,
    changedNodeIdSet,
    connectorRows,
    currentNodeIdSet,
    nodeEntriesById,
    passiveImpactMetricLabel,
    passiveImpactRowsByNodeId,
    renderedNodes,
    selectedEntryKey,
    selectedNodeIdSet,
    showContext,
    targetNodeIdSet,
  ])

  const groupedEntries = useMemo(
    () => sortGroupedEntriesForDisplay(groupEntries(filteredEntries), passiveImpactRowsByNodeId),
    [filteredEntries, passiveImpactRowsByNodeId],
  )

  return (
    <div className="flex flex-col gap-4">
      {viewModel.warningEntries.length > 0 ? (
        <div className="flex flex-col gap-2">
          {viewModel.warningEntries.map((entry) => (
            <div
              key={getEntryKey(entry)}
              className={`rounded-large border p-3 ${getEntryToneClasses(entry)}`}
            >
              <p className="text-foreground text-sm font-semibold">{entry.label}</p>
              {entry.shortStatText ? (
                <p className="text-default-600 mt-1 text-sm">{entry.shortStatText}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div role="group" aria-label="Tree zoom" className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="tertiary" isDisabled={!activeViewBox || zoomLevel <= MIN_ZOOM_LEVEL} onPress={() => changeZoom(1 / 1.5)}>
          Zoom out
        </Button>
        <Button size="sm" variant="tertiary" isDisabled={!activeViewBox || zoomLevel >= MAX_ZOOM_LEVEL} onPress={() => changeZoom(1.5)}>
          Zoom in
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => {
            setSelectedEntryKey(null)
            setViewMode('default')
            zoomLevelRef.current = 1
            panOffsetRef.current = { x: 0, y: 0 }
            setZoomLevel(1)
            applyInteractiveViewBox()
          }}
          isDisabled={!renderData || !activeViewBox}
        >
          Reset view
        </Button>
        {renderData && activeViewBox ? (
          <Chip size="sm" variant="soft">
            {zoomLevel.toFixed(1)}x
          </Chip>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          className={`rounded-large border-divider/70 bg-content1 min-w-0 border p-4 ${VISUAL_PANEL_HEIGHT_CLASS}`}
        >
          {loading ? (
            <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-semibold">
                Loading official tree geometry
              </p>
              <p className="text-default-600 mt-1 text-sm">
                Pulling the live passive-tree layout so the diff map can render accurately.
              </p>
            </div>
          ) : !renderData || !activeViewBox ? (
            <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-semibold">Visual diff unavailable</p>
              <p className="text-default-600 mt-1 text-sm">
                {visualUnavailableDetail ?? 'The node list is still available below.'}
              </p>
            </div>
          ) : (
            <div
              ref={mapViewportRef}
              className={`rounded-large relative overflow-hidden border border-white/5 bg-[radial-gradient(circle_at_top,#1f2430,#11151f_50%,#0b0d12)] ${VISUAL_PANEL_HEIGHT_CLASS} ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{ touchAction: zoomLevel > MIN_ZOOM_LEVEL ? 'none' : 'auto' }}
              onPointerDown={(event) => {
                if (!activeViewBoxRef.current || zoomLevelRef.current <= 1 || event.button !== 0)
                  return

                const target = event.target as Element | null
                const isNodeInteraction = !!target?.closest('[data-node-entry="true"]')

                if (isNodeInteraction) return

                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                dragStateRef.current = {
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                }
              }}
              onPointerMove={(event) => {
                if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId)
                  return
                const baseViewBox = activeViewBoxRef.current
                if (!baseViewBox || !mapViewportRef.current) return

                event.stopPropagation()

                const rect = mapViewportRef.current.getBoundingClientRect()
                if (rect.width <= 0 || rect.height <= 0) return

                const currentInteractiveViewBox = buildInteractiveViewBox(
                  baseViewBox,
                  zoomLevelRef.current,
                  panOffsetRef.current,
                )

                const deltaX = event.clientX - dragStateRef.current.clientX
                const deltaY = event.clientY - dragStateRef.current.clientY
                const worldDeltaX = (deltaX / rect.width) * currentInteractiveViewBox.width
                const worldDeltaY = (deltaY / rect.height) * currentInteractiveViewBox.height

                panOffsetRef.current = {
                  x: panOffsetRef.current.x - worldDeltaX,
                  y: panOffsetRef.current.y - worldDeltaY,
                }
                scheduleInteractiveViewBox()

                dragStateRef.current = {
                  pointerId: event.pointerId,
                  clientX: event.clientX,
                  clientY: event.clientY,
                }
              }}
              onPointerUp={(event) => {
                if (dragStateRef.current?.pointerId === event.pointerId) {
                  event.stopPropagation()
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  dragStateRef.current = null
                }
              }}
              onPointerCancel={(event) => {
                if (dragStateRef.current?.pointerId === event.pointerId) {
                  event.stopPropagation()
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  dragStateRef.current = null
                }
              }}
              onPointerLeave={() => {
                dragStateRef.current = null
              }}
            >
              {mapSvg}
              <div className="pointer-events-none absolute inset-0 z-10">
                <svg className="absolute inset-0 h-full w-full overflow-visible">
                  {projectedDiffMapLabels.map(({ label, nodeX, nodeY, anchorX, anchorY }) => {
                    const selected = getEntryKey(label.entry) === selectedEntryKey
                    const tone = getNodeTone(label.entry)

                    return (
                      <line
                        key={`label-line-${getEntryKey(label.entry)}`}
                        x1={nodeX}
                        y1={nodeY}
                        x2={anchorX}
                        y2={anchorY}
                        stroke={tone.stroke}
                        strokeOpacity={selected ? 0.9 : 0.55}
                        strokeWidth={selected ? 2.5 : 1.5}
                        strokeLinecap="round"
                      />
                    )
                  })}
                </svg>

                {projectedPassiveImpactNodeBadges.map((badge) => (
                  <div
                    key={`ehp-node-badge-${badge.entryKey}`}
                    data-passive-ehp-badge="true"
                    aria-hidden="true"
                    className={`absolute rounded-full border px-2 py-0.5 text-[10px] leading-4 font-semibold whitespace-nowrap shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-sm ${badge.toneClassName}`}
                    style={{
                      left: badge.left,
                      top: badge.top,
                    }}
                  >
                    {badge.label}
                  </div>
                ))}

                {projectedDiffMapLabels.map(({ label, left, top }) => {
                  const entryKey = getEntryKey(label.entry)
                  const selected = entryKey === selectedEntryKey
                  const tone = getNodeTone(label.entry)

                  return (
                    <button
                      key={`overlay-${entryKey}`}
                      type="button"
                      data-node-entry="true"
                      onClick={() => {
                        setSelectedEntryKey(entryKey)
                        setViewMode('selected')
                      }}
                      className="pointer-events-auto absolute rounded-small border bg-content4 px-2.5 py-1.5 text-left shadow-large transition-colors hover:bg-surface-hover"
                      style={{
                        left,
                        top,
                        width: label.width,
                        minHeight: label.height,
                        borderColor: selected ? 'var(--highlight)' : tone.stroke,
                        color: tone.text,
                      }}
                    >
                      {label.lines.map((line, index) => (
                        <span
                          key={`${entryKey}-line-${index}`}
                          className={`block ${index === 0 ? 'text-[12px] leading-4 font-semibold' : 'mt-0.5 text-[10px] leading-3.5'}`}
                        >
                          {line}
                        </span>
                      ))}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 xl:min-w-0">
          <div
            className={`rounded-large border-divider/70 bg-content1 border p-4 xl:flex xl:h-[540px] xl:flex-col xl:overflow-hidden`}
          >
            <p className="text-foreground text-sm font-semibold">Difference list</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={activeFilter === 'all' ? 'primary' : 'tertiary'}
                onPress={() => setActiveFilter('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'add' ? 'primary' : 'tertiary'}
                onPress={() => setActiveFilter('add')}
              >
                Add {filterCounts.add}
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'remove' ? 'primary' : 'tertiary'}
                onPress={() => setActiveFilter('remove')}
              >
                Refund {filterCounts.remove}
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'mastery_change' ? 'primary' : 'tertiary'}
                onPress={() => setActiveFilter('mastery_change')}
              >
                Mastery {filterCounts.mastery_change}
              </Button>
              <Button
                size="sm"
                variant={activeFilter === 'cluster_review' ? 'primary' : 'tertiary'}
                onPress={() => setActiveFilter('cluster_review')}
              >
                Cluster {filterCounts.cluster_review}
              </Button>
            </div>

            <div className="mt-4 flex flex-col gap-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
              {groupedEntries.length === 0 ? (
                <div className="rounded-large border-success/30 bg-success/10 border p-3">
                  <p className="text-foreground text-sm font-semibold">
                    No actionable node differences
                  </p>
                  <p className="text-default-600 mt-1 text-sm">
                    The current tree already matches the target for base nodes and mastery effects.
                  </p>
                </div>
              ) : (
                groupedEntries.map((group) => (
                  <div key={group.kind} className="flex flex-col gap-2">
                    <p className="text-default-500 text-xs font-medium tracking-wide uppercase">
                      {getKindLabel(group.kind)}
                    </p>
                    {group.entries.map((entry) => {
                      const entryKey = getEntryKey(entry)
                      const selected = entryKey === selectedEntryKey
                      const descriptionLines = getEntryDescriptionLines(entry)
                      const passiveImpactRow =
                        entry.nodeId != null
                          ? passiveImpactRowsByNodeId.get(entry.nodeId)
                          : undefined
                      return (
                        <button
                          key={entryKey}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            if (selectedEntryKey === entryKey) {
                              setSelectedEntryKey(null)
                              setViewMode('default')
                            } else {
                              setSelectedEntryKey(entryKey)
                              if (entry.x != null && entry.y != null) {
                                setViewMode('selected')
                              }
                            }
                          }}
                          className={`rounded-large border p-3 text-left transition ${
                            selected
                              ? 'border-highlight bg-selected'
                              : getEntryToneClasses(entry)
                          }`}
                        >
                          <div>
                            <div>
                              <p className="text-foreground text-sm font-semibold">{entry.label}</p>
                              {descriptionLines.map((line, index) => (
                                <p
                                  key={`${entryKey}-detail-${index}`}
                                  className="text-default-600 mt-1 text-sm"
                                >
                                  {line}
                                </p>
                              ))}
                              {passiveImpactRow ? (
                                <PassiveImpactChips
                                  row={passiveImpactRow}
                                  metricLabel={passiveImpactMetricLabel}
                                />
                              ) : null}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
