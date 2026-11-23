import { Button } from '@heroui/react/button'
import { Dropdown } from '@heroui/react/dropdown'
import { Header } from '@heroui/react/header'
import { Tooltip } from '@heroui/react/tooltip'
import { Check, ChevronDown, LocateFixed, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import {
  PASSIVE_TREE_DIFF_LABELS,
  TREE_CHANGE_TONES,
  type PassiveTreeDiffEntry,
  type PassiveTreeDiffViewModel,
} from '../../lib/passive-tree-diff'
import { hasPassiveTreeNodeArt } from '../../lib/passive-tree-game-art'
import { PASSIVE_TREE_WHEEL_LABEL_MAX_FONT_SIZE } from '../../lib/passive-tree-layout'
import type {
  PassiveTreeRenderData,
  PassiveTreeRenderNode,
} from '../../lib/passive-tree-render-data'
import { PassiveTreeChangeIcon } from './PassiveTreeChangeIcon'
import { PassiveTreeGameArt } from './PassiveTreeGameArt'
import { usePassiveTreeGameArt } from './usePassiveTreeGameArt'

type Point = { x: number; y: number }
type ViewBox = Point & { width: number; height: number }
type MapView = 'Overlay' | 'Current' | 'Target'
type MapAppearance = 'contrast' | 'game'

const MAP_VIEWS: MapView[] = ['Overlay', 'Current', 'Target']
const MAP_APPEARANCES = [
  { id: 'contrast', label: 'High contrast' },
  { id: 'game', label: 'Game art' },
] as const

const VIEW_PADDING = 240
const MIN_VIEW_SIZE = 525
const NODE_FOCUS_SIZE = 1450
const PAN_KEYS: Record<string, [number, number] | undefined> = {
  ArrowLeft: [-0.1, 0],
  ArrowRight: [0.1, 0],
  ArrowUp: [0, -0.1],
  ArrowDown: [0, 0.1],
}

function formatViewBox({ x, y, width, height }: ViewBox): string {
  return `${x} ${y} ${width} ${height}`
}

function fitPoints(points: Point[], fallback: ViewBox): ViewBox {
  if (points.length === 0) return fallback
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = Math.max(maxX - minX + 2 * VIEW_PADDING, MIN_VIEW_SIZE)
  const height = Math.max(maxY - minY + 2 * VIEW_PADDING, MIN_VIEW_SIZE)
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height }
}

function viewCenter(view: ViewBox): Point {
  return { x: view.x + view.width / 2, y: view.y + view.height / 2 }
}

function centerView(view: ViewBox, point: Point): ViewBox {
  return { ...view, x: point.x - view.width / 2, y: point.y - view.height / 2 }
}

function toTreePoint(svg: SVGSVGElement, point: Point): Point | null {
  const transform = svg.getScreenCTM()
  if (!transform) return null
  const projected = new DOMPoint(point.x, point.y).matrixTransform(transform.inverse())
  return Number.isFinite(projected.x) && Number.isFinite(projected.y) ? projected : null
}

function translate(view: ViewBox, from: Point, to: Point): ViewBox {
  return { ...view, x: view.x + from.x - to.x, y: view.y + from.y - to.y }
}

function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function zoomView(view: ViewBox, anchor: Point, scale: number, maxSize: number): ViewBox {
  const size = Math.max(view.width, view.height)
  const limit = Math.min(maxSize, Math.max(MIN_VIEW_SIZE, size / scale))
  const ratio = limit / size
  return {
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
    width: view.width * ratio,
    height: view.height * ratio,
  }
}

function useTreeCamera(initialView: ViewBox, maxSize: number) {
  const [view, setView] = useState(initialView)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const viewRef = useRef(initialView)
  const svgRef = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gestureMoved = useRef(false)

  function moveTo(nextView: ViewBox) {
    viewRef.current = nextView
    // Keep the SVG transform current when several pointer events arrive before React paints.
    svgRef.current?.setAttribute('viewBox', formatViewBox(nextView))
    setView(nextView)
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const observer = new ResizeObserver(() => {
      setViewport({ width: svg.clientWidth, height: svg.clientHeight })
    })
    observer.observe(svg)

    function wheel(event: WheelEvent) {
      if (!svg) return
      const anchor = toTreePoint(svg, { x: event.clientX, y: event.clientY })
      if (!anchor) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1
      const delta = Math.max(-160, Math.min(160, event.deltaY * unit))
      moveTo(zoomView(viewRef.current, anchor, Math.exp(-delta * 0.003), maxSize))
    }

    svg.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      svg.removeEventListener('wheel', wheel)
    }
  }, [maxSize])

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    if (!pointers.current.size) gestureMoved.current = false
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const next = { x: event.clientX, y: event.clientY }
    const companion = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1]
    if (!companion && !gestureMoved.current && distance(previous, next) < 5) return

    const svg = event.currentTarget
    const from = toTreePoint(svg, companion ? midpoint(previous, companion) : previous)
    const to = toTreePoint(svg, companion ? midpoint(next, companion) : next)
    if (!from || !to) return

    gestureMoved.current = true
    if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, next)
    const panned = translate(viewRef.current, from, to)
    if (!companion) {
      moveTo(panned)
      return
    }

    const beforeDistance = Math.max(1, distance(previous, companion))
    const afterDistance = Math.max(1, distance(next, companion))
    moveTo(zoomView(panned, from, afterDistance / beforeDistance, maxSize))
  }

  function endPointer(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const unitsPerPixel = Math.max(
    view.width / (viewport.width || view.width),
    view.height / (viewport.height || view.height),
  )
  // With SVG's default aspect-ratio behavior, geometry can also show in the letterbox.
  const visibleView = centerView(
    {
      ...view,
      width: Math.max(view.width, viewport.width * unitsPerPixel),
      height: Math.max(view.height, viewport.height * unitsPerPixel),
    },
    viewCenter(view),
  )

  return {
    svgRef,
    view,
    visibleView,
    moveTo,
    gestureMoved,
    unitsPerPixel,
    zoom(scale: number) {
      moveTo(zoomView(viewRef.current, viewCenter(viewRef.current), scale, maxSize))
    },
    focusNode(point: Point) {
      const view = viewRef.current
      const searchScale = Math.max(view.width, view.height) / NODE_FOCUS_SIZE
      const focused = searchScale > 1 ? zoomView(view, point, searchScale, maxSize) : view
      moveTo(centerView(focused, point))
    },
    pan(dx: number, dy: number) {
      const next = viewRef.current
      moveTo({ ...next, x: next.x + next.width * dx, y: next.y + next.height * dy })
    },
    onPointerDown,
    onPointerMove,
    endPointer,
    onPointerLeave(event: PointerEvent<SVGSVGElement>) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) endPointer(event)
    },
  }
}

function drawNode(node: PassiveTreeRenderNode, radius: number, fill: string, stroke: string) {
  if (node.isMastery) {
    return (
      <rect
        x={node.x - radius * 0.72}
        y={node.y - radius * 0.72}
        width={radius * 1.44}
        height={radius * 1.44}
        transform={`rotate(45 ${node.x} ${node.y})`}
        fill={fill}
        stroke={stroke}
        vectorEffect="non-scaling-stroke"
      />
    )
  }
  return (
    <circle
      cx={node.x}
      cy={node.y}
      r={radius}
      fill={fill}
      stroke={stroke}
      vectorEffect="non-scaling-stroke"
    />
  )
}

export function PassiveTreeMap({
  id,
  data,
  diff,
  visibleEntries,
  selected,
  onSelect,
  selectionRequest,
  filterControl,
  reviewNode,
  onDismissReview,
}: {
  id: string
  data: PassiveTreeRenderData
  diff: PassiveTreeDiffViewModel
  visibleEntries: PassiveTreeDiffEntry[]
  selected: PassiveTreeDiffEntry | null
  onSelect: (entry: PassiveTreeDiffEntry, focusList: boolean) => void
  selectionRequest: Ref<(point: Point) => void>
  filterControl: ReactNode
  reviewNode?: PassiveTreeRenderNode
  onDismissReview: () => void
}) {
  const [mapView, setMapView] = useState<MapView>('Overlay')
  const [appearance, setAppearance] = useState<MapAppearance>('contrast')
  const optionsDescriptionId = useId()
  const artwork = appearance === 'game' ? data.artwork : undefined
  const gameArt = usePassiveTreeGameArt(artwork)
  const fullView = useMemo(
    () => ({
      x: data.bounds.minX,
      y: data.bounds.minY,
      width: Math.max(data.bounds.maxX - data.bounds.minX, MIN_VIEW_SIZE),
      height: Math.max(data.bounds.maxY - data.bounds.minY, MIN_VIEW_SIZE),
    }),
    [data.bounds],
  )
  const sides = useMemo(() => {
    const current = new Set(diff.currentNodeIds)
    const target = new Set(diff.targetNodeIds)
    const combined = new Set([...current, ...target])
    return { current, target, combined, union: [...combined] }
  }, [diff.currentNodeIds, diff.targetNodeIds])
  const initialView = useMemo(
    () =>
      fitPoints(
        diff.entries.map(({ node }) => node),
        fitPoints(
          sides.union.map((id) => data.nodes[id]),
          fullView,
        ),
      ),
    [data.nodes, diff.entries, fullView, sides.union],
  )
  const maxSize = Math.max(fullView.width, fullView.height)
  const camera = useTreeCamera(initialView, maxSize)
  useImperativeHandle(selectionRequest, () => camera.focusNode)

  const fittedChanges = fitPoints(
    visibleEntries.map((entry) => entry.node),
    initialView,
  )
  const view = camera.view
  const reviewRadius = Math.max(55, camera.unitsPerPixel * 13)
  const activeNodes =
    mapView === 'Current' ? sides.current : mapView === 'Target' ? sides.target : null
  const visibleNodeEntries = new Map(
    visibleEntries
      .filter(({ node }) => !activeNodes || activeNodes.has(node.nodeId))
      .map((entry) => [entry.node.nodeId, entry]),
  )
  const drawnIds =
    selected && !sides.union.includes(selected.node.nodeId)
      ? [...sides.union, selected.node.nodeId]
      : sides.union
  const basePaths = useMemo(
    () => data.connectors.map((connector) => connector.path).join(' '),
    [data.connectors],
  )
  const baseDots = useMemo(
    () =>
      Object.values(data.nodes)
        .filter((node) => !node.isProxy)
        .map(({ x, y }) => `M ${x} ${y} h 0.01`)
        .join(' '),
    [data.nodes],
  )
  const activePaths = useMemo(() => {
    const common: string[] = []
    const fromCurrent: string[] = []
    const fromTarget: string[] = []
    for (const { fromNodeId, toNodeId, path } of data.connectors) {
      const isCurrent =
        mapView !== 'Target' && sides.current.has(fromNodeId) && sides.current.has(toNodeId)
      const isTarget =
        mapView !== 'Current' && sides.target.has(fromNodeId) && sides.target.has(toNodeId)
      if (isCurrent && isTarget) common.push(path)
      else if (isCurrent) fromCurrent.push(path)
      else if (isTarget) fromTarget.push(path)
    }
    return {
      common: common.join(' '),
      current: fromCurrent.join(' '),
      target: fromTarget.join(' '),
    }
  }, [data.connectors, mapView, sides])

  return (
    <section aria-label="Tree map" className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {filterControl}
          <Dropdown>
            <Dropdown.Trigger
              className="select__trigger h-8 min-h-8 w-auto min-w-0 gap-1.5 px-2.5 text-xs font-medium"
              aria-label="Map options"
              aria-describedby={optionsDescriptionId}
            >
              <span className="sm:hidden">Options</span>
              <span className="hidden sm:inline">Map options</span>
              <ChevronDown size={13} aria-hidden="true" />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom start" className="min-w-44">
              <Dropdown.Menu aria-label="Map options">
                <Dropdown.Section aria-label="Tree view">
                  <Header className="text-default-500 px-2 py-1 text-xs font-medium">
                    Tree view
                  </Header>
                  {MAP_VIEWS.map((option) => (
                    <Dropdown.Item
                      key={option}
                      id={option}
                      textValue={option}
                      aria-label={option}
                      aria-describedby={
                        mapView === option ? `${optionsDescriptionId}-view` : undefined
                      }
                      onAction={() => setMapView(option)}
                    >
                      <span className="flex-1">{option}</span>
                      {mapView === option ? (
                        <>
                          <Check size={15} aria-hidden="true" />
                          <span id={`${optionsDescriptionId}-view`} className="sr-only">
                            Selected view
                          </span>
                        </>
                      ) : null}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
                {data.artwork ? (
                  <Dropdown.Section
                    aria-label="Tree appearance"
                    className="border-divider mt-1 border-t pt-1"
                  >
                    <Header className="text-default-500 px-2 py-1 text-xs font-medium">
                      Tree appearance
                    </Header>
                    {MAP_APPEARANCES.map(({ id: option, label }) => (
                      <Dropdown.Item
                        key={option}
                        id={option}
                        textValue={label}
                        aria-label={label}
                        aria-describedby={
                          appearance === option ? `${optionsDescriptionId}-appearance` : undefined
                        }
                        onAction={() => setAppearance(option)}
                      >
                        <span className="flex-1">{label}</span>
                        {appearance === option ? (
                          <>
                            <Check size={15} aria-hidden="true" />
                            <span id={`${optionsDescriptionId}-appearance`} className="sr-only">
                              Selected appearance
                            </span>
                          </>
                        ) : null}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Section>
                ) : null}
                <Dropdown.Section aria-label="Camera" className="border-divider mt-1 border-t pt-1">
                  <Dropdown.Item
                    id="reset"
                    onAction={() => {
                      onDismissReview()
                      camera.moveTo(initialView)
                    }}
                  >
                    Reset view
                  </Dropdown.Item>
                </Dropdown.Section>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
        <div role="group" aria-label="Map controls" className="flex items-center">
          <Tooltip>
            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              aria-label="Zoom out"
              onPress={() => camera.zoom(1 / 1.4)}
            >
              <ZoomOut size={16} aria-hidden="true" />
            </Button>
            <Tooltip.Content>Zoom out</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              aria-label="Zoom in"
              onPress={() => camera.zoom(1.4)}
            >
              <ZoomIn size={16} aria-hidden="true" />
            </Button>
            <Tooltip.Content>Zoom in</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              size="sm"
              variant="tertiary"
              aria-label="Fit changes"
              className="min-w-8 gap-1 px-2"
              isDisabled={!visibleEntries.length}
              onPress={() => {
                onDismissReview()
                camera.moveTo(fittedChanges)
              }}
            >
              <Maximize size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Fit</span>
            </Button>
            <Tooltip.Content>Fit changes</Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <div className="relative">
        <span id={optionsDescriptionId} className="sr-only">
          {data.artwork
            ? `${mapView}, ${appearance === 'game' ? 'Game art' : 'High contrast'}`
            : mapView}
        </span>
        <svg
          id={id}
          ref={camera.svgRef}
          role="group"
          aria-label="Passive tree comparison map"
          aria-description={reviewNode ? `Located ${reviewNode.label}` : undefined}
          data-appearance={appearance}
          tabIndex={0}
          viewBox={formatViewBox(view)}
          className="rounded-large border-divider bg-navigation focus-visible:outline-highlight h-[clamp(240px,49dvh,340px)] w-full touch-none scroll-mt-11 border outline-offset-2 focus-visible:outline-2 lg:h-(--tree-map-height)"
          style={{ cursor: 'grab' }}
          onPointerDown={camera.onPointerDown}
          onPointerMove={camera.onPointerMove}
          onPointerUp={camera.endPointer}
          onPointerCancel={camera.endPointer}
          onLostPointerCapture={camera.endPointer}
          onPointerLeave={camera.onPointerLeave}
          onClickCapture={(event) => {
            if (event.detail > 0 && camera.gestureMoved.current) event.stopPropagation()
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            const panKey = PAN_KEYS[event.key]
            if (panKey) {
              event.preventDefault()
              camera.pan(panKey[0], panKey[1])
            }
          }}
        >
          {artwork ? (
            <PassiveTreeGameArt
              artwork={artwork}
              images={gameArt.images}
              viewBox={camera.visibleView}
              unitsPerPixel={camera.unitsPerPixel}
              activeNodeIds={activeNodes ?? sides.combined}
              layer="backdrops"
            />
          ) : null}
          <g aria-hidden="true" fill="none" pointerEvents="none">
            <path
              d={basePaths}
              stroke="var(--control-edge)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={baseDots}
              stroke="var(--control-edge)"
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={activePaths.common}
              stroke="var(--muted-text)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={activePaths.current}
              stroke="var(--currency)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={activePaths.target}
              stroke="var(--info)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
          {artwork ? (
            <PassiveTreeGameArt
              artwork={artwork}
              images={gameArt.images}
              viewBox={camera.visibleView}
              unitsPerPixel={camera.unitsPerPixel}
              activeNodeIds={activeNodes ?? sides.combined}
              layer="nodes"
            />
          ) : null}
          {data.ascendancyWheels?.map(({ id, name, x, labelY }) => (
            <text
              key={id}
              x={x}
              y={labelY}
              textAnchor="middle"
              fontSize={Math.min(PASSIVE_TREE_WHEEL_LABEL_MAX_FONT_SIZE, camera.unitsPerPixel * 12)}
              fontWeight={600}
              fill="var(--foreground)"
              stroke="var(--navigation)"
              strokeWidth={camera.unitsPerPixel * 2}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {name}
            </text>
          ))}
          {drawnIds.map((id) => {
            const node = data.nodes[id]
            const entry = visibleNodeEntries.get(id)
            const isSelected = selected?.node.nodeId === id
            const allocatedInView = !activeNodes || activeNodes.has(id)
            if (!allocatedInView && !isSelected) return null
            const visibleEntry = entry ?? (isSelected ? selected : null)
            const nodeRadius = node.isKeystone ? 55 : node.isNotable || node.isMastery ? 37 : 22
            const radius = visibleEntry
              ? Math.max(nodeRadius, camera.unitsPerPixel * 8)
              : nodeRadius
            const hasArtwork = artwork
              ? hasPassiveTreeNodeArt(artwork, gameArt.images, id, allocatedInView)
              : false
            const iconSize = radius * 1.35
            const showComparisonMarker = visibleEntry && appearance === 'contrast'
            const tone = showComparisonMarker
              ? TREE_CHANGE_TONES[visibleEntry.kind]
              : 'text-default-500'
            const bounds = camera.visibleView
            const visible =
              node.x >= bounds.x &&
              node.x <= bounds.x + bounds.width &&
              node.y >= bounds.y &&
              node.y <= bounds.y + bounds.height

            return (
              <g
                key={id}
                role={visibleEntry ? 'button' : undefined}
                aria-hidden={!visibleEntry || undefined}
                aria-label={visibleEntry ? `Select ${node.label} on map` : undefined}
                aria-description={
                  visibleEntry ? PASSIVE_TREE_DIFF_LABELS[visibleEntry.kind] : undefined
                }
                aria-pressed={visibleEntry ? isSelected : undefined}
                tabIndex={visibleEntry ? (visible ? 0 : -1) : undefined}
                data-node-id={visibleEntry ? id : undefined}
                className={`${tone} ${visibleEntry ? 'group cursor-pointer' : 'pointer-events-none'} ${appearance === 'game' ? 'focus-visible:outline-highlight focus-visible:outline-2' : 'outline-none'}`}
                onClick={visibleEntry ? () => onSelect(visibleEntry, false) : undefined}
                onKeyDown={
                  visibleEntry
                    ? (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        onSelect(visibleEntry, true)
                      }
                    : undefined
                }
              >
                {visibleEntry ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius + 8}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={12}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {visibleEntry ? <title>{node.label}</title> : null}
                {hasArtwork
                  ? null
                  : drawNode(
                      node,
                      showComparisonMarker ? radius : nodeRadius,
                      'var(--navigation)',
                      'currentColor',
                    )}
                {showComparisonMarker ? (
                  <>
                    <PassiveTreeChangeIcon
                      kind={visibleEntry.kind}
                      x={node.x - iconSize / 2}
                      y={node.y - iconSize / 2}
                      size={iconSize}
                      strokeWidth={2.75}
                      pointerEvents="none"
                    />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius + camera.unitsPerPixel * 4}
                      fill="none"
                      stroke={isSelected ? 'var(--foreground)' : 'currentColor'}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeDasharray={
                        !allocatedInView || visibleEntry.kind === 'current' ? '3 2' : undefined
                      }
                      vectorEffect="non-scaling-stroke"
                      className={
                        isSelected
                          ? undefined
                          : 'opacity-45 group-hover:opacity-100 group-focus-visible:opacity-100'
                      }
                    />
                  </>
                ) : null}
              </g>
            )
          })}
          {reviewNode ? (
            <g
              data-review-node-id={reviewNode.nodeId}
              transform={`translate(${reviewNode.x} ${reviewNode.y})`}
              aria-hidden="true"
              pointerEvents="none"
              className="text-highlight"
            >
              <circle
                r={reviewRadius}
                fill="var(--navigation)"
                fillOpacity={0.24}
                stroke="currentColor"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <LocateFixed
                x={-reviewRadius * 0.74}
                y={-reviewRadius * 0.74}
                size={reviewRadius * 1.48}
              />
            </g>
          ) : null}
        </svg>
        {artwork && gameArt.status !== 'ready' && gameArt.status !== 'idle' ? (
          <div
            role="status"
            className="border-control bg-navigation text-foreground absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          >
            <span>
              {gameArt.status === 'loading'
                ? 'Loading game art…'
                : gameArt.status === 'partial'
                  ? 'Some game art could not load'
                  : 'Game art unavailable'}
            </span>
            {gameArt.status !== 'loading' ? (
              <Button size="sm" variant="tertiary" onPress={gameArt.retry}>
                Retry game art
              </Button>
            ) : null}
          </div>
        ) : null}
        {reviewNode ? (
          <div className="border-control bg-navigation text-foreground absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border py-0.5 pr-0.5 pl-2.5 text-xs font-medium">
            <LocateFixed size={14} aria-hidden="true" className="text-highlight shrink-0" />
            <span className="min-w-0 wrap-anywhere" role="status">
              {reviewNode.label}
            </span>
            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              aria-label="Dismiss map marker"
              onPress={() => {
                onDismissReview()
                camera.svgRef.current?.focus({ preventScroll: true })
              }}
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {selected ? (
          <div
            aria-hidden="true"
            className="border-control bg-navigation text-foreground pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          >
            {appearance === 'contrast' ? (
              <PassiveTreeChangeIcon
                kind={selected.kind}
                size={14}
                className={TREE_CHANGE_TONES[selected.kind]}
              />
            ) : null}
            <span className="min-w-0 wrap-anywhere">{selected.node.label}</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
