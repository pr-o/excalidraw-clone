import { describe, expect, it } from "vitest"
import { pointInPolygon } from "../src"

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
