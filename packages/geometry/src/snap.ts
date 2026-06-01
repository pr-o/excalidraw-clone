import type { Point } from "./types"

export interface GridSnap {
  enabled: boolean
  size: number
}

export interface SnapModifiers {
  ctrl: boolean
  meta: boolean
}

export const snapPointToGrid = (p: Point, grid: GridSnap, mods: SnapModifiers): Point => {
  if (!grid.enabled || grid.size <= 0 || mods.ctrl || mods.meta) return p
  // `+ 0` normalizes `-0` (e.g. Math.round(-0.5) → -0) to `0` for predictable equality.
  return {
    x: Math.round(p.x / grid.size) * grid.size + 0,
    y: Math.round(p.y / grid.size) * grid.size + 0,
  }
}
