import { getElementBounds } from "./bounds"
import type { ExcalidrawElement } from "./types"

export type AlignEdge = "left" | "centerX" | "right" | "top" | "centerY" | "bottom"
export type DistributeAxis = "horizontal" | "vertical"

export interface PositionPatch {
  id: string
  x: number
  y: number
}

export function alignElements(
  elements: readonly ExcalidrawElement[],
  edge: AlignEdge,
): PositionPatch[] {
  if (elements.length < 2) return []
  const items = elements.map((el) => ({ el, b: getElementBounds(el) }))
  const minX = Math.min(...items.map(({ b }) => b.x))
  const maxX = Math.max(...items.map(({ b }) => b.x + b.width))
  const minY = Math.min(...items.map(({ b }) => b.y))
  const maxY = Math.max(...items.map(({ b }) => b.y + b.height))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return items.map(({ el, b }) => {
    let { x, y } = el
    switch (edge) {
      case "left":
        x = el.x + (minX - b.x)
        break
      case "right":
        x = el.x + (maxX - b.width - b.x)
        break
      case "centerX":
        x = el.x + (centerX - b.width / 2 - b.x)
        break
      case "top":
        y = el.y + (minY - b.y)
        break
      case "bottom":
        y = el.y + (maxY - b.height - b.y)
        break
      case "centerY":
        y = el.y + (centerY - b.height / 2 - b.y)
        break
    }
    return { id: el.id, x, y }
  })
}

export function distributeElements(
  elements: readonly ExcalidrawElement[],
  axis: DistributeAxis,
): PositionPatch[] {
  if (elements.length < 3) return []
  const horizontal = axis === "horizontal"
  const items = elements
    .map((el) => {
      const b = getElementBounds(el)
      return { el, start: horizontal ? b.x : b.y, size: horizontal ? b.width : b.height }
    })
    .sort((p, q) => p.start - q.start)

  const first = items[0]!
  const last = items[items.length - 1]!
  const spanStart = first.start + first.size // inner (right/bottom) edge of first
  const spanEnd = last.start // inner (left/top) edge of last
  const interiorSize = items.slice(1, -1).reduce((sum, it) => sum + it.size, 0)
  const gap = (spanEnd - spanStart - interiorSize) / (items.length - 1)

  const patches: PositionPatch[] = []
  let cursor = spanStart
  for (let i = 1; i < items.length - 1; i += 1) {
    cursor += gap
    const it = items[i]!
    const delta = cursor - it.start
    patches.push({
      id: it.el.id,
      x: horizontal ? it.el.x + delta : it.el.x,
      y: horizontal ? it.el.y : it.el.y + delta,
    })
    cursor += it.size
  }
  return patches
}
