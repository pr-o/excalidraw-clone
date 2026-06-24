import { describe, expect, it } from "vitest"
import { edgePointToward } from "../src/binding-edge"
import type { Bounds } from "../src/types"

// 100x100 box centered at (50,50)
const box: Bounds = { x: 0, y: 0, width: 100, height: 100 }

describe("edgePointToward — rect", () => {
  it("crosses the right edge for a point due east", () => {
    const p = edgePointToward(box, "rect", { x: 1000, y: 50 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it("crosses the top edge for a point due north", () => {
    const p = edgePointToward(box, "rect", { x: 50, y: -1000 })
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(0)
  })
  it("crosses a corner for a diagonal point", () => {
    const p = edgePointToward(box, "rect", { x: 1000, y: 1000 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(100)
  })
})

describe("edgePointToward — ellipse", () => {
  it("crosses the right vertex due east", () => {
    const p = edgePointToward(box, "ellipse", { x: 1000, y: 50 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it("crosses the ellipse boundary on the diagonal (inside the rect corner)", () => {
    const p = edgePointToward(box, "ellipse", { x: 1000, y: 1000 })
    // 45° on a circle r=50 → center + (50/√2, 50/√2)
    expect(p.x).toBeCloseTo(50 + 50 / Math.SQRT2)
    expect(p.y).toBeCloseTo(50 + 50 / Math.SQRT2)
  })
})

describe("edgePointToward — diamond", () => {
  it("crosses the right vertex due east", () => {
    const p = edgePointToward(box, "diamond", { x: 1000, y: 50 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })
  it("crosses the diamond edge on the diagonal", () => {
    const p = edgePointToward(box, "diamond", { x: 1000, y: 1000 })
    // |x|/50 + |y|/50 = 1 with x==y → x = 25
    expect(p.x).toBeCloseTo(75)
    expect(p.y).toBeCloseTo(75)
  })
})

describe("edgePointToward — degenerate", () => {
  it("returns the center when toward == center", () => {
    const p = edgePointToward(box, "rect", { x: 50, y: 50 })
    expect(p).toEqual({ x: 50, y: 50 })
  })
  it("returns the center for a zero-width box", () => {
    const flat: Bounds = { x: 10, y: 10, width: 0, height: 40 }
    const p = edgePointToward(flat, "ellipse", { x: 1000, y: 30 })
    expect(p).toEqual({ x: 10, y: 30 })
  })
})
