import { describe, expect, it } from "vitest"
import { boundsCenter } from "../src/bounds"
import { pointInConvexPolygon, polygonEdgePointToward, shapeVertices } from "../src/polygon"
import type { Bounds } from "../src/types"

const box: Bounds = { x: 0, y: 0, width: 100, height: 60 }

describe("shapeVertices", () => {
  it("triangle: apex top-center, base bottom", () => {
    expect(shapeVertices("triangle", box)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ])
  })

  it("parallelogram: right-leaning with 25% skew", () => {
    expect(shapeVertices("parallelogram", box)).toEqual([
      { x: 25, y: 0 },
      { x: 100, y: 0 },
      { x: 75, y: 60 },
      { x: 0, y: 60 },
    ])
  })

  it("hexagon: flat top/bottom, left/right points, 25% inset", () => {
    expect(shapeVertices("hexagon", box)).toEqual([
      { x: 25, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 30 },
      { x: 75, y: 60 },
      { x: 25, y: 60 },
      { x: 0, y: 30 },
    ])
  })

  it("offsets by the bounds origin", () => {
    const shifted = shapeVertices("triangle", { x: 10, y: 20, width: 100, height: 60 })
    expect(shifted[0]).toEqual({ x: 60, y: 20 })
  })
})

describe("pointInConvexPolygon", () => {
  const tri = shapeVertices("triangle", box)
  const center = boundsCenter(box)

  it("hits the centroid area and misses the empty bbox corner", () => {
    expect(pointInConvexPolygon({ x: 50, y: 40 }, tri, center)).toBe(true)
    // top-left corner of the bbox is outside the triangle
    expect(pointInConvexPolygon({ x: 5, y: 5 }, tri, center)).toBe(false)
  })

  it("respects rotation", () => {
    // rotate 180°: the empty corner region moves to the bottom-left
    expect(pointInConvexPolygon({ x: 5, y: 55 }, tri, center, Math.PI)).toBe(false)
    expect(pointInConvexPolygon({ x: 5, y: 5 }, tri, center, Math.PI)).toBe(true)
  })

  it("returns false for degenerate polygons", () => {
    expect(pointInConvexPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(false)
  })
})

describe("polygonEdgePointToward", () => {
  it("hexagon: ray to the right exits exactly at the right point", () => {
    const hex = shapeVertices("hexagon", box)
    const p = polygonEdgePointToward(hex, box, { x: 500, y: 30 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(30)
  })

  it("triangle: upward ray exits on the boundary above the center", () => {
    const tri = shapeVertices("triangle", box)
    const p = polygonEdgePointToward(tri, box, { x: 50, y: -100 })
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(0)
  })

  it("triangle: slanted ray lands on the slanted edge, inside the bbox", () => {
    const tri = shapeVertices("triangle", box)
    const p = polygonEdgePointToward(tri, box, { x: 500, y: -170 }) // up-right diagonal
    // must lie strictly inside the bbox width (not the bbox corner)
    expect(p.x).toBeLessThan(100)
    expect(p.y).toBeGreaterThan(0)
    // and on the right slanted edge: from (50,0) to (100,60) → y = (x-50) * 60/50
    expect(p.y).toBeCloseTo(((p.x - 50) * 60) / 50, 5)
  })

  it("degenerate direction falls back to the center", () => {
    const tri = shapeVertices("triangle", box)
    expect(polygonEdgePointToward(tri, box, boundsCenter(box))).toEqual(boundsCenter(box))
  })
})
