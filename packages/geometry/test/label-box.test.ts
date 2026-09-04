import { describe, expect, it } from "vitest"
import {
  boundsCenter,
  labelInnerBox,
  mirroredShapeVertices,
  pointInConvexPolygon,
  shapeVertices,
} from "../src"
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

  it("octagon gets a 1/3 x-inset at full height", () => {
    expect(labelInnerBox("octagon", b(0, 0, 120, 60))).toEqual({
      x: 40,
      y: 8,
      width: 40,
      height: 44,
    })
  })

  it("pentagon gets the base band below the shoulders", () => {
    expect(labelInnerBox("pentagon", b(0, 0, 100, 60))).toEqual({
      x: 20,
      y: 24,
      width: 60,
      height: 28,
    })
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
    for (const kind of ["triangle", "parallelogram", "hexagon", "pentagon", "octagon"] as const) {
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

describe("labelInnerBox — mirror aware", () => {
  it("[1,1] (and the default) leaves the box untouched", () => {
    for (const kind of ["triangle", "pentagon", "hexagon", "octagon"] as const) {
      const bounds = b(0, 0, 100, 80)
      expect(labelInnerBox(kind, bounds, 8, [1, 1])).toEqual(labelInnerBox(kind, bounds))
    }
  })

  it("y-mirrored triangle: the box moves to the (now wide) top half", () => {
    // unmirrored 100x100 triangle -> {25, 50, 50, 42}; reflected across cy=50
    expect(labelInnerBox("triangle", b(0, 0, 100, 100), 8, [1, -1])).toEqual({
      x: 25,
      y: 8,
      width: 50,
      height: 42,
    })
  })

  it("y-mirrored pentagon: the base band moves to the top", () => {
    // unmirrored 100x60 pentagon -> {20, 24, 60, 28}; reflected across cy=30
    expect(labelInnerBox("pentagon", b(0, 0, 100, 60), 8, [1, -1])).toEqual({
      x: 20,
      y: 8,
      width: 60,
      height: 28,
    })
  })

  it("reflects about the container centre, not the origin (offset bounds)", () => {
    expect(labelInnerBox("triangle", b(40, 30, 100, 100), 8, [1, -1])).toEqual({
      x: 65,
      y: 38,
      width: 50,
      height: 42,
    })
  })

  it("x-mirroring an x-symmetric kind is a no-op", () => {
    const bounds = b(0, 0, 100, 100)
    expect(labelInnerBox("triangle", bounds, 8, [-1, 1])).toEqual(labelInnerBox("triangle", bounds))
    expect(labelInnerBox("pentagon", bounds, 8, [-1, 1])).toEqual(labelInnerBox("pentagon", bounds))
  })

  it("mirroring twice on the same axis is an involution", () => {
    const bounds = b(7, 11, 120, 90)
    for (const kind of ["triangle", "parallelogram", "hexagon", "pentagon", "octagon"] as const) {
      const once = labelInnerBox(kind, bounds, 8, [-1, -1])
      // reflecting the already-reflected box back gives the original
      const back = {
        x: 2 * bounds.x + bounds.width - (once.x + once.width),
        y: 2 * bounds.y + bounds.height - (once.y + once.height),
        width: once.width,
        height: once.height,
      }
      expect(back).toEqual(labelInnerBox(kind, bounds))
    }
  })

  it("mirrored boxes stay inside the mirrored shape outline", () => {
    const bounds = b(13, 21, 200, 160) // non-zero origin: reflection is about the centre

    const mirrors = [
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const
    for (const kind of ["triangle", "parallelogram", "hexagon", "pentagon", "octagon"] as const) {
      for (const mirror of mirrors) {
        const box = labelInnerBox(kind, bounds, 8, mirror)
        const vertices = mirroredShapeVertices(kind, bounds, mirror)
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
    }
  })
})
