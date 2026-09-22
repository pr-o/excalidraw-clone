import type { Bounds } from "./types"

export interface AlignmentGuide {
  axis: "x" | "y"
  position: number
  start: number
  end: number
}

export interface AlignmentSnapResult {
  dx: number
  dy: number
  guides: readonly AlignmentGuide[]
}

interface AxisTriple {
  near: number
  center: number
  far: number
}

const xTriple = (b: Bounds): AxisTriple => ({
  near: b.x,
  center: b.x + b.width / 2,
  far: b.x + b.width,
})

const yTriple = (b: Bounds): AxisTriple => ({
  near: b.y,
  center: b.y + b.height / 2,
  far: b.y + b.height,
})

interface AxisMatch {
  distance: number
  correction: number
  position: number
  perpStart: number
  perpEnd: number
}

/** Finds the single closest (moving-value, candidate-value) pair within
 *  `thresholdWorld` for one axis, comparing near/center/far of the moving
 *  box against near/center/far of every candidate. Returns null when
 *  nothing is within threshold. */
const bestAxisMatch = (
  movingBounds: Bounds,
  candidateBounds: readonly Bounds[],
  axis: "x" | "y",
  thresholdWorld: number,
): AxisMatch | null => {
  const movingTriple = axis === "x" ? xTriple(movingBounds) : yTriple(movingBounds)
  const movingValues = [movingTriple.near, movingTriple.center, movingTriple.far]
  const movingPerpStart = axis === "x" ? movingBounds.y : movingBounds.x
  const movingPerpEnd =
    axis === "x" ? movingBounds.y + movingBounds.height : movingBounds.x + movingBounds.width

  let best: AxisMatch | null = null
  for (const candidate of candidateBounds) {
    const candidateTriple = axis === "x" ? xTriple(candidate) : yTriple(candidate)
    const candidateValues = [candidateTriple.near, candidateTriple.center, candidateTriple.far]
    const candidatePerpStart = axis === "x" ? candidate.y : candidate.x
    const candidatePerpEnd =
      axis === "x" ? candidate.y + candidate.height : candidate.x + candidate.width

    for (const mv of movingValues) {
      for (const cv of candidateValues) {
        const distance = Math.abs(cv - mv)
        if (distance > thresholdWorld) continue
        if (best === null || distance < best.distance) {
          best = {
            distance,
            correction: cv - mv,
            position: cv,
            perpStart: Math.min(movingPerpStart, candidatePerpStart),
            perpEnd: Math.max(movingPerpEnd, candidatePerpEnd),
          }
        }
      }
    }
  }
  return best
}

/** Compares the moving bbox's near-edge/center/far-edge against every
 *  candidate's same three values, independently per axis. The closest
 *  match within `thresholdWorld` wins that axis; an axis with no match
 *  contributes zero correction and no guide. */
export const computeAlignmentSnap = (
  movingBounds: Bounds,
  candidateBounds: readonly Bounds[],
  thresholdWorld: number,
): AlignmentSnapResult => {
  const guides: AlignmentGuide[] = []
  let dx = 0
  let dy = 0

  const xMatch = bestAxisMatch(movingBounds, candidateBounds, "x", thresholdWorld)
  if (xMatch) {
    dx = xMatch.correction
    guides.push({
      axis: "x",
      position: xMatch.position,
      start: xMatch.perpStart,
      end: xMatch.perpEnd,
    })
  }

  const yMatch = bestAxisMatch(movingBounds, candidateBounds, "y", thresholdWorld)
  if (yMatch) {
    dy = yMatch.correction
    guides.push({
      axis: "y",
      position: yMatch.position,
      start: yMatch.perpStart,
      end: yMatch.perpEnd,
    })
  }

  return { dx, dy, guides }
}
