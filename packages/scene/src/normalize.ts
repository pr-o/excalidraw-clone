import type { ExcalidrawElement } from "./types"

export function normalizeToOrigin(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  if (elements.length === 0) return []
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (const el of elements) {
    if (el.x < minX) minX = el.x
    if (el.y < minY) minY = el.y
  }
  return elements.map((el) => ({ ...el, x: el.x - minX, y: el.y - minY }))
}
