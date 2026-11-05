import type { Bounds } from "./types"

/** One distance read-out: a straight line from the selection to its nearest
 *  neighbour on one side. `axis` is the direction the line runs ("x" is
 *  horizontal), `from`/`to` its ends along that axis, `at` its position on the
 *  other axis. */
export interface GapMeasurement {
  side: "left" | "right" | "top" | "bottom"
  axis: "x" | "y"
  from: number
  to: number
  at: number
  distance: number
}

type Side = GapMeasurement["side"]

/** Gaps smaller than this are touching, not spaced: no read-out. */
const MIN_GAP = 0.5

const overlap = (a0: number, a1: number, b0: number, b1: number): [number, number] | null => {
  const lo = Math.max(a0, b0)
  const hi = Math.min(a1, b1)
  return hi > lo ? [lo, hi] : null
}

const contains = (outer: Bounds, inner: Bounds): boolean =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height

/**
 * Distances from `selection` to the nearest thing on each of its four sides.
 *
 * A neighbour counts for a side when it lies entirely beyond that edge and the
 * two overlap on the other axis, so the line between them is straight; the line
 * runs through the middle of that overlap. A box that contains the selection
 * (a frame around it) counts on every side, measured to its inner edge. Boxes
 * that intersect the selection without containing it are ignored. The nearest
 * candidate wins each side; sides with nothing, or a gap under half a unit,
 * are left out.
 */
export const measureGaps = (selection: Bounds, others: readonly Bounds[]): GapMeasurement[] => {
  const left = selection.x
  const right = selection.x + selection.width
  const top = selection.y
  const bottom = selection.y + selection.height
  const best = new Map<Side, GapMeasurement>()
  const offer = (m: GapMeasurement) => {
    if (m.distance < MIN_GAP) return
    const current = best.get(m.side)
    if (!current || m.distance < current.distance) best.set(m.side, m)
  }

  for (const o of others) {
    const oRight = o.x + o.width
    const oBottom = o.y + o.height
    if (contains(o, selection)) {
      const midX = (left + right) / 2
      const midY = (top + bottom) / 2
      offer({ side: "left", axis: "x", from: o.x, to: left, at: midY, distance: left - o.x })
      offer({
        side: "right",
        axis: "x",
        from: right,
        to: oRight,
        at: midY,
        distance: oRight - right,
      })
      offer({ side: "top", axis: "y", from: o.y, to: top, at: midX, distance: top - o.y })
      offer({
        side: "bottom",
        axis: "y",
        from: bottom,
        to: oBottom,
        at: midX,
        distance: oBottom - bottom,
      })
      continue
    }
    const ys = overlap(top, bottom, o.y, oBottom)
    if (ys) {
      const at = (ys[0] + ys[1]) / 2
      if (oRight <= left) {
        offer({ side: "left", axis: "x", from: oRight, to: left, at, distance: left - oRight })
      } else if (o.x >= right) {
        offer({ side: "right", axis: "x", from: right, to: o.x, at, distance: o.x - right })
      }
    }
    const xs = overlap(left, right, o.x, oRight)
    if (xs) {
      const at = (xs[0] + xs[1]) / 2
      if (oBottom <= top) {
        offer({ side: "top", axis: "y", from: oBottom, to: top, at, distance: top - oBottom })
      } else if (o.y >= bottom) {
        offer({ side: "bottom", axis: "y", from: bottom, to: o.y, at, distance: o.y - bottom })
      }
    }
  }
  return (["left", "right", "top", "bottom"] as const).flatMap((s) => {
    const m = best.get(s)
    return m ? [m] : []
  })
}
