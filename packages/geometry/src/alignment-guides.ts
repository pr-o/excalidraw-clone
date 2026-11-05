import { boundsSpan } from "./bounds"
import type { Axis, Bounds } from "./types"

export interface AlignmentGuide {
  axis: Axis
  position: number
  start: number
  end: number
}

/** User-placed ruler guides in scene coordinates: `x` holds vertical lines
 *  (x positions), `y` holds horizontal lines (y positions). */
export interface UserGuides {
  x: readonly number[]
  y: readonly number[]
}

export interface AlignmentSnapResult {
  dx: number
  dy: number
  guides: readonly AlignmentGuide[]
}

/** A box's near edge, centre and far edge along `axis`: the values that snap. */
const snapValues = (b: Bounds, axis: Axis): readonly [number, number, number] => {
  const [start, end] = boundsSpan(b, axis)
  return [start, (start + end) / 2, end]
}

const crossAxis = (axis: Axis): Axis => (axis === "x" ? "y" : "x")

interface AxisMatch {
  /** Shift along the axis that lands the moving value on the target. */
  correction: number
  /** Where the guide is drawn, and its extent along the other axis. */
  position: number
  start: number
  end: number
}

const isCloser = (best: AxisMatch | null, correction: number, threshold: number): boolean =>
  Math.abs(correction) <= threshold &&
  (best === null || Math.abs(correction) < Math.abs(best.correction))

/** The single closest (moving value, target) pair within `threshold` on one
 *  axis. Targets are every candidate's near/centre/far and the user guide
 *  lines; the first pair wins a tie. */
const bestAxisMatch = (
  moving: Bounds,
  candidates: readonly Bounds[],
  axis: Axis,
  threshold: number,
  lines: readonly number[],
): AxisMatch | null => {
  const movingValues = snapValues(moving, axis)
  const [movingStart, movingEnd] = boundsSpan(moving, crossAxis(axis))
  let best: AxisMatch | null = null
  for (const candidate of candidates) {
    const [candidateStart, candidateEnd] = boundsSpan(candidate, crossAxis(axis))
    const start = Math.min(movingStart, candidateStart)
    const end = Math.max(movingEnd, candidateEnd)
    for (const mv of movingValues) {
      for (const cv of snapValues(candidate, axis)) {
        if (isCloser(best, cv - mv, threshold))
          best = { correction: cv - mv, position: cv, start, end }
      }
    }
  }
  // A guide line spans the whole canvas, so its visual just tracks the moving box.
  for (const line of lines) {
    for (const mv of movingValues) {
      if (isCloser(best, line - mv, threshold)) {
        best = { correction: line - mv, position: line, start: movingStart, end: movingEnd }
      }
    }
  }
  return best
}

/** Compares the moving bbox's near-edge/center/far-edge against every
 *  candidate's same three values, independently per axis. The closest
 *  match within `thresholdWorld` wins that axis; an axis with no match
 *  contributes zero correction and no guide. `lines` are user guides, which
 *  compete with element candidates on distance alone. */
export const computeAlignmentSnap = (
  movingBounds: Bounds,
  candidateBounds: readonly Bounds[],
  thresholdWorld: number,
  lines: UserGuides = { x: [], y: [] },
): AlignmentSnapResult => {
  const x = bestAxisMatch(movingBounds, candidateBounds, "x", thresholdWorld, lines.x)
  const y = bestAxisMatch(movingBounds, candidateBounds, "y", thresholdWorld, lines.y)
  const guides: AlignmentGuide[] = []
  if (x) guides.push({ axis: "x", position: x.position, start: x.start, end: x.end })
  if (y) guides.push({ axis: "y", position: y.position, start: y.start, end: y.end })
  return { dx: x?.correction ?? 0, dy: y?.correction ?? 0, guides }
}
