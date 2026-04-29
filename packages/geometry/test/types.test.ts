import { describe, it, expect } from "vitest"
import type { Bounds, LineSegment, Point, Vector, ViewTransform } from "../src"

describe("geometry types", () => {
  it("Point literal is assignable", () => {
    const p: Point = { x: 1, y: 2 }
    expect(p.x + p.y).toBe(3)
  })

  it("Vector is structurally identical to Point", () => {
    const v: Vector = { x: 1, y: 0 }
    const p: Point = v
    expect(p).toBe(v)
  })

  it("Bounds literal is assignable", () => {
    const b: Bounds = { x: 0, y: 0, width: 10, height: 5 }
    expect(b.width * b.height).toBe(50)
  })

  it("LineSegment is a readonly tuple of two points", () => {
    const seg: LineSegment = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(seg).toHaveLength(2)
  })

  it("ViewTransform literal is assignable", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    expect(t.zoom).toBe(1)
  })
})
