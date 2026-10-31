import type { Point } from "@excalidraw-clone/geometry"

export interface LinearPatch {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
}

/** Re-anchor absolute points: origin at their bbox top-left, points relative to it. */
export const pointsPatch = (absPoints: readonly Point[]): LinearPatch => {
  const xs = absPoints.map((p) => p.x)
  const ys = absPoints.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    points: absPoints.map((p) => ({ x: p.x - minX, y: p.y - minY })),
  }
}
