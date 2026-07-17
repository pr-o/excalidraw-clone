import { describe, expect, it } from "vitest"
import { boundsCenter, labelInnerBox, pointInConvexPolygon, shapeVertices } from "../src"
import type { Bounds } from "../src"

const b = (x: number, y: number, width: number, height: number): Bounds => ({
  x,
  y,
  width,
  height,
})

describe("labelInnerBox", () => {
  it("rectangle keeps the plain 8px inset (sticky-note behavior)", () => {
    expect(labelInnerBox("rectangle", b(0, 0, 100, 60))).toEqual({
      x: 8,
      y: 8,
      width: 84,
      height: 44,
    })
  })

  it("ellipse gets the inscribed rect (w/√2 × h/√2, centered)", () => {
    const box = labelInnerBox("ellipse", b(0, 0, 100, 100))
    expect(box.x).toBeCloseTo((100 - 100 * Math.SQRT1_2) / 2, 5)
    expect(box.width).toBeCloseTo(100 * Math.SQRT1_2, 5)
    expect(box.y).toBeCloseTo(box.x, 5)
    expect(box.height).toBeCloseTo(box.width, 5)
  })

  it("diamond gets the centered half-size box", () => {
    expect(labelInnerBox("diamond", b(0, 0, 100, 80))).toEqual({
      x: 25,
      y: 20,
      width: 50,
      height: 40,
    })
  })

  it("triangle gets the bottom-half inscribed rect (minus bottom min inset)", () => {
    expect(labelInnerBox("triangle", b(0, 0, 100, 80))).toEqual({
      x: 25,
      y: 40,
      width: 50,
      height: 32,
    })
  })

  it("parallelogram and hexagon get a 25% x-inset at full height (minus min inset)", () => {
    for (const kind of ["parallelogram", "hexagon"] as const) {
      expect(labelInnerBox(kind, b(0, 0, 100, 80))).toEqual({
        x: 25,
        y: 8,
        width: 50,
        height: 64,
      })
    }
  })

  it("respects the minimum inset on small shapes", () => {
    // diamond factor box is {5,5,10,10}; the 8px inset ring shrinks it further
    expect(labelInnerBox("diamond", b(0, 0, 20, 20))).toEqual({ x: 8, y: 8, width: 4, height: 4 })
  })

  it("clamps degenerate boxes to zero size", () => {
    const box = labelInnerBox("rectangle", b(0, 0, 10, 10))
    expect(box.width).toBe(0)
    expect(box.height).toBe(0)
  })

  it("offsets by the container origin", () => {
    expect(labelInnerBox("diamond", b(40, 30, 100, 80))).toEqual({
      x: 65,
      y: 50,
      width: 50,
      height: 40,
    })
  })

  it("polygon-kind boxes stay inside the shape outline", () => {
    const bounds = b(0, 0, 200, 160)
    for (const kind of ["triangle", "parallelogram", "hexagon"] as const) {
      const box = labelInnerBox(kind, bounds)
      const vertices = shapeVertices(kind, bounds)
      const center = boundsCenter(bounds)
      const corners = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ]
      for (const c of corners) {
        expect(pointInConvexPolygon(c, vertices, center)).toBe(true)
      }
    }
  })
})
