import type { Point, Vector } from "./types"

export const pointAdd = (a: Point, b: Vector): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const pointScale = (p: Point, s: number): Point => ({ x: p.x * s, y: p.y * s })

export const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y
export const cross = (a: Vector, b: Vector): number => a.x * b.y - a.y * b.x

export const vectorLength = (v: Vector): number => Math.hypot(v.x, v.y)

export const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export const normalize = (v: Vector): Vector => {
  const len = vectorLength(v)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}
