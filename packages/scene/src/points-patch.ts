import { boundsFromPoints, type Point } from "@excalidraw-clone/geometry"

export interface LinearPatch {
  x: number
  y: number
  width: number
  height: number
  points: readonly Point[]
}

/** Re-anchor absolute points: origin at their bbox top-left, points relative to it. */
export const pointsPatch = (absPoints: readonly Point[]): LinearPatch => {
  // A loop, not Math.min(...points): a long freehand stroke would overflow the call stack.
  const { x, y, width, height } = boundsFromPoints(absPoints)
  return { x, y, width, height, points: absPoints.map((p) => ({ x: p.x - x, y: p.y - y })) }
}
