import { describe, expect, it } from "vitest"
import { distancePointToSegment, pointOnSegment } from "../src"
import type { Point } from "../src"

describe("distancePointToSegment", () => {
  const a: Point = { x: 0, y: 0 }
  const b: Point = { x: 10, y: 0 } // horizontal segment along x-axis

  it.each<[Point, number, string]>([
    [{ x: 5, y: 0 }, 0, "on the segment"],
    [{ x: 0, y: 0 }, 0, "at endpoint a"],
    [{ x: 10, y: 0 }, 0, "at endpoint b"],
    [{ x: 5, y: 3 }, 3, "perpendicular above midpoint"],
    [{ x: 5, y: -4 }, 4, "perpendicular below midpoint"],
    [{ x: -3, y: 0 }, 3, "off the 'a' end"],
    [{ x: 13, y: 0 }, 3, "off the 'b' end"],
    [{ x: -3, y: 4 }, 5, "off-end and offset (3-4-5 triangle)"],
    [{ x: 13, y: 4 }, 5, "off-other-end and offset"],
  ])("distance(%j, [a,b]) ≈ %d [%s]", (p, expected) => {
    expect(distancePointToSegment(p, a, b)).toBeCloseTo(expected)
  })

  it("zero-length segment falls back to point distance", () => {
    const same: Point = { x: 5, y: 5 }
    expect(distancePointToSegment({ x: 5, y: 5 }, same, same)).toBe(0)
    expect(distancePointToSegment({ x: 8, y: 9 }, same, same)).toBeCloseTo(5)
  })

  it("diagonal segment perpendicular distance", () => {
    // Segment from (0,0) to (4,3); length 5. Perpendicular distance from
    // (-3, 4) to the infinite line is | -3*3 - 4*4 | / 5 = | -9 - 16 | / 5 = 5,
    // but (-3,4) projects off the 'a' end so we get distance to (0,0) = 5.
    const p: Point = { x: -3, y: 4 }
    expect(distancePointToSegment(p, { x: 0, y: 0 }, { x: 4, y: 3 })).toBeCloseTo(5)
  })
})

describe("pointOnSegment", () => {
  const a: Point = { x: 0, y: 0 }
  const b: Point = { x: 10, y: 0 }

  it.each<[Point, number, boolean]>([
    [{ x: 5, y: 0 }, 1, true], // on segment, threshold 1
    [{ x: 5, y: 0.5 }, 1, true], // close, within threshold
    [{ x: 5, y: 1 }, 1, true], // exactly threshold (inclusive)
    [{ x: 5, y: 1.01 }, 1, false], // just over threshold
    [{ x: 5, y: 5 }, 1, false], // far
    [{ x: -3, y: 0 }, 5, true], // off-end, within threshold
    [{ x: -3, y: 0 }, 2, false], // off-end, beyond threshold
  ])("on segment(%j, threshold %d) === %s", (p, threshold, expected) => {
    expect(pointOnSegment(p, a, b, threshold)).toBe(expected)
  })
})
