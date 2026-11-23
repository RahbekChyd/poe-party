import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  getPassiveTreeNodeArt,
  type PassiveTreeArtwork,
  type PassiveTreeArtImages,
  type PassiveTreeArtSprite,
} from '../../lib/passive-tree-game-art'

interface TreeViewBox {
  x: number
  y: number
  width: number
  height: number
}

interface PassiveTreeGameArtProps {
  artwork: PassiveTreeArtwork
  images: PassiveTreeArtImages
  viewBox: TreeViewBox
  unitsPerPixel: number
  activeNodeIds: ReadonlySet<number>
  layer?: 'backdrops' | 'nodes'
}

interface SpritePlacement {
  sprite: PassiveTreeArtSprite
  x: number
  y: number
  mirrorY?: boolean
}

const MAX_CANVAS_DIMENSION = 2048

function getRasterSize(width: number, height: number, unitsPerPixel: number) {
  const scale = Math.min(
    Math.min(window.devicePixelRatio || 1, 2) / unitsPerPixel,
    MAX_CANVAS_DIMENSION / Math.max(width, height),
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function isVisible(view: TreeViewBox, x: number, y: number, width: number, height: number) {
  return (
    x + width / 2 >= view.x &&
    x - width / 2 <= view.x + view.width &&
    y + height / 2 >= view.y &&
    y - height / 2 <= view.y + view.height
  )
}

function drawSprite(
  context: CanvasRenderingContext2D,
  images: PassiveTreeArtImages,
  sprite: PassiveTreeArtSprite,
  x: number,
  y: number,
) {
  const image = images.get(sprite.url)
  if (!image) return
  context.drawImage(
    image,
    sprite.sourceX,
    sprite.sourceY,
    sprite.sourceWidth,
    sprite.sourceHeight,
    x,
    y,
    sprite.width,
    sprite.height,
  )
}

export function PassiveTreeGameArt({
  artwork,
  images,
  viewBox,
  unitsPerPixel,
  activeNodeIds,
  layer,
}: PassiveTreeGameArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawBackdrops = layer !== 'nodes'
  const drawNodes = layer !== 'backdrops'
  const allocatedIds = drawNodes ? activeNodeIds : undefined
  const placements = useMemo(() => {
    if (images.size === 0) return []
    const drawn: SpritePlacement[] = drawBackdrops
      ? artwork.backdrops.filter(({ sprite }) => images.has(sprite.url))
      : []
    if (allocatedIds) {
      for (const { nodeId, x, y } of Object.values(artwork.nodes)) {
        const variant = getPassiveTreeNodeArt(artwork, images, nodeId, allocatedIds.has(nodeId))
        if (variant?.icon) drawn.push({ sprite: variant.icon, x, y })
        if (variant?.frame) drawn.push({ sprite: variant.frame, x, y })
      }
    }
    return drawn
  }, [allocatedIds, artwork, drawBackdrops, images])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewBox.width <= 0 || viewBox.height <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return

    const size = getRasterSize(viewBox.width, viewBox.height, unitsPerPixel)
    if (canvas.width !== size.width) canvas.width = size.width
    if (canvas.height !== size.height) canvas.height = size.height
    context.resetTransform()
    context.clearRect(0, 0, size.width, size.height)
    const scaleX = size.width / viewBox.width
    const scaleY = size.height / viewBox.height
    context.setTransform(scaleX, 0, 0, scaleY, -viewBox.x * scaleX, -viewBox.y * scaleY)

    for (const { sprite, x, y, mirrorY } of placements) {
      if (!isVisible(viewBox, x, y, sprite.width, sprite.height * (mirrorY ? 2 : 1))) continue
      const left = x - sprite.width / 2
      if (!mirrorY) {
        drawSprite(context, images, sprite, left, y - sprite.height / 2)
        continue
      }
      drawSprite(context, images, sprite, left, y - sprite.height)
      context.save()
      context.translate(0, y)
      context.scale(1, -1)
      drawSprite(context, images, sprite, left, -sprite.height)
      context.restore()
    }
  }, [images, placements, unitsPerPixel, viewBox])

  if (!placements.length) return null
  return (
    <foreignObject
      x={viewBox.x}
      y={viewBox.y}
      width={viewBox.width}
      height={viewBox.height}
      aria-hidden="true"
      pointerEvents="none"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none block size-full"
        data-passive-tree-art={drawNodes ? '' : undefined}
      />
    </foreignObject>
  )
}
