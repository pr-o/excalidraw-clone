import { describe, expect, it } from "vitest"
import { pointInPolygon, polygonIntersectsBounds } from "../src"

describe("pointInPolygon", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]
  // A "C" shape: the notch (x 4..10, y 4..6) is outside.
  const c = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 6 },
    { x: 10, y: 6 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it("contains interior points and rejects exterior ones", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 11, y: 5 }, square)).toBe(false)
  })

  it("handles concave polygons", () => {
    expect(pointInPolygon({ x: 2, y: 5 }, c)).toBe(true)
    expect(pointInPolygon({ x: 7, y: 5 }, c)).toBe(false)
  })

  it("is false for fewer than 3 vertices", () => {
    expect(
      pointInPolygon({ x: 1, y: 1 }, [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ]),
    ).toBe(false)
  })
})

describe("polygonIntersectsBounds", () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 0, y: 20 },
  ]
  it("detects containment, crossing and separation", () => {
    expect(polygonIntersectsBounds(tri, { x: 2, y: 2, width: 3, height: 3 })).toBe(true) // inside
    expect(polygonIntersectsBounds(tri, { x: 8, y: 8, width: 20, height: 20 })).toBe(true) // edge crosses
    expect(polygonIntersectsBounds(tri, { x: -50, y: -50, width: 200, height: 200 })).toBe(true) // contains polygon
    expect(polygonIntersectsBounds(tri, { x: 15, y: 15, width: 5, height: 5 })).toBe(false) // beyond hypotenuse
  })
})
