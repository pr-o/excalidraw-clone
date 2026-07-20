import type { Bounds, Point } from "@excalidraw-clone/geometry"

export type Side = "top" | "right" | "bottom" | "left"

export const ELBOW_STUB = 16

const NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

const isHorizontal = (s: Side): boolean => s === "left" || s === "right"

/** Dominant axis of (toward - center); ties prefer horizontal. */
export const sideOf = (center: Point, toward: Point): Side => {
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left"
  return dy >= 0 ? "bottom" : "top"
}

/** Midpoint of a bounds side, pushed outward by gap. */
export const sideCenter = (bounds: Bounds, side: Side, gap: number): Point => {
  const n = NORMALS[side]
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  return {
    x: cx + n.x * (bounds.width / 2 + gap),
    y: cy + n.y * (bounds.height / 2 + gap),
  }
}

const stubOut = (p: Point, side: Side | null): Point =>
  side === null
    ? p
    : { x: p.x + NORMALS[side].x * ELBOW_STUB, y: p.y + NORMALS[side].y * ELBOW_STUB }

/** Single-corner connection (straight when already aligned). */
const connect = (a: Point, b: Point, horizontalFirst: boolean): Point[] => {
  if (a.x === b.x || a.y === b.y) return [a, b]
  return horizontalFirst ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]
}

const simplify = (pts: readonly Point[]): Point[] => {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    out.push(p)
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const a = out[i - 1]!
    const b = out[i]!
    const c = out[i + 1]!
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1)
  }
  return out
}

/**
 * Orthogonal route from start to end. A non-null side means the endpoint
 * leaves its shape perpendicular to that side through a 16px stub.
 */
export function routeElbow(
  start: Point,
  end: Point,
  startSide: Side | null,
  endSide: Side | null,
): Point[] {
  const s1 = stubOut(start, startSide)
  const e1 = stubOut(end, endSide)
  let mid: Point[]
  if (startSide !== null && endSide !== null) {
    const sh = isHorizontal(startSide)
    const eh = isHorizontal(endSide)
    if (sh && eh) {
      if (startSide !== endSide) {
        const midX = (s1.x + e1.x) / 2
        mid = [s1, { x: midX, y: s1.y }, { x: midX, y: e1.y }, e1]
      } else {
        const outerX = startSide === "right" ? Math.max(s1.x, e1.x) : Math.min(s1.x, e1.x)
        mid = [s1, { x: outerX, y: s1.y }, { x: outerX, y: e1.y }, e1]
      }
    } else if (!sh && !eh) {
      if (startSide !== endSide) {
        const midY = (s1.y + e1.y) / 2
        mid = [s1, { x: s1.x, y: midY }, { x: e1.x, y: midY }, e1]
      } else {
        const outerY = startSide === "bottom" ? Math.max(s1.y, e1.y) : Math.min(s1.y, e1.y)
        mid = [s1, { x: s1.x, y: outerY }, { x: e1.x, y: outerY }, e1]
      }
    } else {
      mid = sh ? [s1, { x: e1.x, y: s1.y }, e1] : [s1, { x: s1.x, y: e1.y }, e1]
    }
  } else if (startSide !== null) {
    mid = connect(s1, e1, isHorizontal(startSide))
  } else if (endSide !== null) {
    mid = connect(s1, e1, !isHorizontal(endSide))
  } else {
    const horizontalFirst = Math.abs(e1.x - s1.x) >= Math.abs(e1.y - s1.y)
    mid = connect(s1, e1, horizontalFirst)
  }
  return simplify([start, ...mid, end])
}
