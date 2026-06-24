import type { Bounds, Point } from "./types"

export type EdgeKind = "rect" | "ellipse" | "diamond"

export const edgePointToward = (bounds: Bounds, kind: EdgeKind, toward: Point): Point => {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  const rx = bounds.width / 2
  const ry = bounds.height / 2
  if ((dx === 0 && dy === 0) || rx === 0 || ry === 0) return { x: cx, y: cy }

  let t: number
  if (kind === "ellipse") {
    t = 1 / Math.hypot(dx / rx, dy / ry)
  } else if (kind === "diamond") {
    t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)
  } else {
    const tx = dx === 0 ? Infinity : rx / Math.abs(dx)
    const ty = dy === 0 ? Infinity : ry / Math.abs(dy)
    t = Math.min(tx, ty)
  }
  return { x: cx + dx * t, y: cy + dy * t }
}
