import { describe, expect, it } from "vitest"
import {
  getElementBounds,
  getElementsBounds,
  newFrame,
  newFreedraw,
  newLine,
  newRectangle,
} from "../src"
import type { ExcalidrawLineElement, ExcalidrawRectangleElement } from "../src"

describe("getElementBounds — rectangular shapes", () => {
  it("axis-aligned rectangle: bounds equal (x, y, width, height)", () => {
    const r: ExcalidrawRectangleElement = {
      ...newRectangle({ x: 10, y: 20, width: 30, height: 40 }),
    }
    const b = getElementBounds(r)
    expect(b.x).toBe(10)
    expect(b.y).toBe(20)
    expect(b.width).toBe(30)
    expect(b.height).toBe(40)
  })

  it("rectangle rotated 90° around its center: width and height swap", () => {
    const r: ExcalidrawRectangleElement = {
      ...newRectangle({ x: 0, y: 0, width: 40, height: 20, angle: Math.PI / 2 }),
    }
    const b = getElementBounds(r)
    expect(b.x).toBeCloseTo(10)
    expect(b.y).toBeCloseTo(-10)
    expect(b.width).toBeCloseTo(20)
    expect(b.height).toBeCloseTo(40)
  })

  it("frame element treated as rectangle for bbox", () => {
    const f = { ...newFrame({ x: 5, y: 6, width: 100, height: 50 }) }
    const b = getElementBounds(f)
    expect(b.x).toBe(5)
    expect(b.y).toBe(6)
    expect(b.width).toBe(100)
    expect(b.height).toBe(50)
  })
})

describe("getElementBounds — linear elements", () => {
  it("line wraps absolute points (origin + relative)", () => {
    const base = newLine({ x: 2, y: 3 })
    const l: ExcalidrawLineElement = {
      ...base,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
    }
    const b = getElementBounds(l)
    expect(b.x).toBe(2)
    expect(b.y).toBe(3)
    expect(b.width).toBe(10)
    expect(b.height).toBe(5)
  })

  it("empty-points freedraw returns zero-size bounds at element origin", () => {
    const f = newFreedraw({ x: 7, y: 9 })
    const b = getElementBounds(f)
    expect(b.x).toBe(7)
    expect(b.y).toBe(9)
    expect(b.width).toBe(0)
    expect(b.height).toBe(0)
  })

  it("line with non-zero angle rotates around (origin + size/2)", () => {
    const base = newLine({
      x: 0,
      y: 0,
      width: 10,
      height: 0,
      angle: Math.PI / 2,
    })
    const l: ExcalidrawLineElement = {
      ...base,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    }
    const b = getElementBounds(l)
    expect(b.width).toBeCloseTo(0)
    expect(b.height).toBeCloseTo(10)
  })
})

describe("getElementsBounds", () => {
  it("returns null for an empty element list", () => {
    expect(getElementsBounds([])).toBeNull()
  })

  it("returns null when every element is deleted", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
    expect(getElementsBounds([a])).toBeNull()
  })

  it("returns a single element's own bounds when there's only one", () => {
    const a = newRectangle({ x: 10, y: 20, width: 30, height: 40 })
    expect(getElementsBounds([a])).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it("returns the union bounding box across multiple elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 40, width: 10, height: 10 })
    const bounds = getElementsBounds([a, b])
    expect(bounds).toEqual({ x: 0, y: 0, width: 60, height: 50 })
  })

  it("ignores deleted elements when computing the union", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 500, y: 500, width: 10, height: 10 }), isDeleted: true }
    expect(getElementsBounds([a, dead])).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })
})
