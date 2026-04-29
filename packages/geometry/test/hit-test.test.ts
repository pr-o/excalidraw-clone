import { describe, expect, it } from "vitest"
import { pointInDiamond, pointInEllipse, pointInRectangle } from "../src"
import type { Bounds, Point } from "../src"

const RECT: Bounds = { x: 0, y: 0, width: 100, height: 50 }

describe("pointInRectangle (axis-aligned)", () => {
  it.each<[Point, boolean]>([
    [{ x: 50, y: 25 }, true], // center
    [{ x: 0, y: 0 }, true], // corner
    [{ x: 100, y: 50 }, true], // opposite corner
    [{ x: -1, y: 25 }, false], // outside left
    [{ x: 101, y: 25 }, false], // outside right
    [{ x: 50, y: -1 }, false], // outside top
    [{ x: 50, y: 51 }, false], // outside bottom
  ])("axis-aligned (%j) === %s", (p, expected) => {
    expect(pointInRectangle(p, RECT)).toBe(expected)
  })
})

describe("pointInRectangle (rotated 90°)", () => {
  // RECT center is (50, 25). Rotating 90° around (50,25) takes axis-aligned
  // (100, 50) -> (75, 75) and (0, 0) -> (25, -25). After rotation, the
  // rectangle's footprint covers x:25–75, y:0–50 in screen space.
  const angle = Math.PI / 2

  it("center is still inside after rotation", () => {
    expect(pointInRectangle({ x: 50, y: 25 }, RECT, angle)).toBe(true)
  })

  it("a point that was inside the AABB but outside the rotated shape is excluded", () => {
    expect(pointInRectangle({ x: 5, y: 25 }, RECT, angle)).toBe(false)
  })

  it("a point inside the rotated shape but outside AABB is included", () => {
    // unrotated (50, 0) is on top edge; after 90° rotation around center,
    // the rotated rectangle's top-left scene-space corner is roughly at (25, 0)
    // and a point like (40, 5) lands inside.
    expect(pointInRectangle({ x: 40, y: 5 }, RECT, angle)).toBe(true)
  })
})

describe("pointInEllipse", () => {
  const E: Bounds = { x: 0, y: 0, width: 100, height: 50 } // rx=50, ry=25, center (50,25)

  it.each<[Point, boolean]>([
    [{ x: 50, y: 25 }, true], // center
    [{ x: 0, y: 25 }, true], // left axis extreme (on boundary)
    [{ x: 100, y: 25 }, true], // right axis extreme
    [{ x: 50, y: 0 }, true], // top axis extreme
    [{ x: 50, y: 50 }, true], // bottom axis extreme
    [{ x: 0, y: 0 }, false], // bbox corner — outside the ellipse
    [{ x: 100, y: 50 }, false], // bbox corner — outside
    [{ x: -1, y: 25 }, false], // just outside left
    [{ x: 101, y: 25 }, false], // just outside right
  ])("axis-aligned ellipse (%j) === %s", (p, expected) => {
    expect(pointInEllipse(p, E)).toBe(expected)
  })

  it("zero-width ellipse never contains anything", () => {
    expect(pointInEllipse({ x: 0, y: 0 }, { x: 0, y: 0, width: 0, height: 50 })).toBe(false)
  })

  it("rotated 90° still contains center", () => {
    expect(pointInEllipse({ x: 50, y: 25 }, E, Math.PI / 2)).toBe(true)
  })
})

describe("pointInDiamond", () => {
  const D: Bounds = { x: 0, y: 0, width: 100, height: 50 } // center (50,25), half (50,25)

  it.each<[Point, boolean]>([
    [{ x: 50, y: 25 }, true], // center
    [{ x: 0, y: 25 }, true], // left vertex (on edge)
    [{ x: 100, y: 25 }, true], // right vertex
    [{ x: 50, y: 0 }, true], // top vertex
    [{ x: 50, y: 50 }, true], // bottom vertex
    [{ x: 0, y: 0 }, false], // bbox corner — outside the diamond
    [{ x: 100, y: 50 }, false], // bbox corner — outside
    [{ x: 25, y: 12.5 }, true], // midpoint of upper-left edge (on boundary)
    [{ x: -1, y: 25 }, false], // just outside left vertex
  ])("axis-aligned diamond (%j) === %s", (p, expected) => {
    expect(pointInDiamond(p, D)).toBe(expected)
  })

  it("zero-height diamond never contains anything", () => {
    expect(pointInDiamond({ x: 50, y: 0 }, { x: 0, y: 0, width: 100, height: 0 })).toBe(false)
  })

  it("rotated 90° still contains center", () => {
    expect(pointInDiamond({ x: 50, y: 25 }, D, Math.PI / 2)).toBe(true)
  })
})
