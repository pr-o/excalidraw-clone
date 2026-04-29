import { describe, expect, it } from "vitest"
import { rotatePoint } from "../src"
import type { Point } from "../src"

const ORIGIN: Point = { x: 0, y: 0 }

const expectClose = (actual: Point, expected: Point) => {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
}

describe("rotatePoint around origin", () => {
  it.each<[Point, number, Point]>([
    [{ x: 1, y: 0 }, 0, { x: 1, y: 0 }],
    [{ x: 1, y: 0 }, Math.PI / 2, { x: 0, y: 1 }],
    [{ x: 1, y: 0 }, Math.PI, { x: -1, y: 0 }],
    [{ x: 1, y: 0 }, -Math.PI / 2, { x: 0, y: -1 }],
    [{ x: 1, y: 0 }, 2 * Math.PI, { x: 1, y: 0 }],
    [{ x: 0, y: 1 }, Math.PI / 2, { x: -1, y: 0 }],
  ])("rotate(%j, %d) ≈ %j", (p, angle, expected) => {
    expectClose(rotatePoint(p, ORIGIN, angle), expected)
  })
})

describe("rotatePoint around non-origin center", () => {
  it("rotating the center returns the center", () => {
    const center: Point = { x: 5, y: 7 }
    expectClose(rotatePoint(center, center, 1.234), center)
  })

  it("rotating 90° around (10, 10) sends (11, 10) -> (10, 11)", () => {
    const center: Point = { x: 10, y: 10 }
    expectClose(rotatePoint({ x: 11, y: 10 }, center, Math.PI / 2), { x: 10, y: 11 })
  })

  it("rotating 180° around (4, 4) sends (5, 5) -> (3, 3)", () => {
    const center: Point = { x: 4, y: 4 }
    expectClose(rotatePoint({ x: 5, y: 5 }, center, Math.PI), { x: 3, y: 3 })
  })

  it("rotation by -angle is inverse of rotation by angle", () => {
    const center: Point = { x: 2, y: -3 }
    const p: Point = { x: 7, y: 11 }
    const angle = 1.7
    const rotated = rotatePoint(p, center, angle)
    expectClose(rotatePoint(rotated, center, -angle), p)
  })
})
