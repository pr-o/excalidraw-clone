import { describe, expect, it } from "vitest"
import {
  boundsCenter,
  boundsContains,
  boundsContainsPoint,
  boundsExpand,
  boundsFromPoints,
  boundsIntersect,
} from "../src"
import type { Bounds, Point } from "../src"

const RECT: Bounds = { x: 10, y: 20, width: 30, height: 40 } // x:10–40, y:20–60

describe("boundsContainsPoint", () => {
  it.each<[Point, boolean]>([
    [{ x: 25, y: 40 }, true], // inside
    [{ x: 10, y: 20 }, true], // top-left corner (inclusive)
    [{ x: 40, y: 60 }, true], // bottom-right corner (inclusive)
    [{ x: 10, y: 40 }, true], // left edge
    [{ x: 25, y: 20 }, true], // top edge
    [{ x: 9, y: 40 }, false], // just outside left
    [{ x: 41, y: 40 }, false], // just outside right
    [{ x: 25, y: 19 }, false], // just outside top
    [{ x: 25, y: 61 }, false], // just outside bottom
    [{ x: -100, y: -100 }, false], // far outside
  ])("contains(%j) === %s", (p, expected) => {
    expect(boundsContainsPoint(RECT, p)).toBe(expected)
  })
})

describe("boundsIntersect", () => {
  const a: Bounds = { x: 0, y: 0, width: 10, height: 10 }

  it.each<[Bounds, boolean, string]>([
    [{ x: 5, y: 5, width: 10, height: 10 }, true, "overlapping"],
    [{ x: 10, y: 0, width: 5, height: 5 }, true, "touching right edge"],
    [{ x: 0, y: 10, width: 5, height: 5 }, true, "touching bottom edge"],
    [{ x: 11, y: 0, width: 5, height: 5 }, false, "disjoint right"],
    [{ x: 0, y: 11, width: 5, height: 5 }, false, "disjoint bottom"],
    [{ x: -10, y: -10, width: 5, height: 5 }, false, "disjoint top-left"],
    [{ x: 2, y: 2, width: 1, height: 1 }, true, "fully inside"],
    [{ x: -5, y: -5, width: 100, height: 100 }, true, "engulfs"],
  ])("intersect(a, %j) === %s [%s]", (b, expected) => {
    expect(boundsIntersect(a, b)).toBe(expected)
    expect(boundsIntersect(b, a)).toBe(expected) // symmetric
  })
})

describe("boundsContains (rect-in-rect)", () => {
  const outer: Bounds = { x: 0, y: 0, width: 100, height: 100 }

  it.each<[Bounds, boolean]>([
    [{ x: 10, y: 10, width: 10, height: 10 }, true],
    [{ x: 0, y: 0, width: 100, height: 100 }, true], // identical = contained
    [{ x: 0, y: 0, width: 101, height: 100 }, false], // exceeds right
    [{ x: -1, y: 0, width: 10, height: 10 }, false], // before left
    [{ x: 50, y: 50, width: 60, height: 10 }, false], // exceeds right
  ])("contains(%j) === %s", (inner, expected) => {
    expect(boundsContains(outer, inner)).toBe(expected)
  })
})

describe("boundsFromPoints", () => {
  it("empty list returns zero bounds", () => {
    expect(boundsFromPoints([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it("single point returns zero-size bounds at point", () => {
    expect(boundsFromPoints([{ x: 5, y: 7 }])).toEqual({ x: 5, y: 7, width: 0, height: 0 })
  })

  it("multiple points covers all extents", () => {
    const points: Point[] = [
      { x: 1, y: 5 },
      { x: 10, y: 2 },
      { x: -3, y: 7 },
    ]
    expect(boundsFromPoints(points)).toEqual({ x: -3, y: 2, width: 13, height: 5 })
  })
})

describe("boundsCenter", () => {
  it.each<[Bounds, Point]>([
    [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 5 },
    ],
    [
      { x: -10, y: -10, width: 20, height: 20 },
      { x: 0, y: 0 },
    ],
    [
      { x: 5, y: 5, width: 0, height: 0 },
      { x: 5, y: 5 },
    ],
  ])("center(%j) === %j", (b, expected) => {
    expect(boundsCenter(b)).toEqual(expected)
  })
})

describe("boundsExpand", () => {
  const base: Bounds = { x: 10, y: 10, width: 20, height: 20 }

  it("padding 0 returns same bounds", () => {
    expect(boundsExpand(base, 0)).toEqual(base)
  })

  it("positive padding grows bounds on all sides", () => {
    expect(boundsExpand(base, 5)).toEqual({ x: 5, y: 5, width: 30, height: 30 })
  })

  it("negative padding shrinks bounds", () => {
    expect(boundsExpand(base, -2)).toEqual({ x: 12, y: 12, width: 16, height: 16 })
  })
})
