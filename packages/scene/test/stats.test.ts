import { describe, expect, it } from "vitest"
import { computeStats, getElementsBounds, newRectangle } from "../src"

describe("computeStats — scene (no selection)", () => {
  it("returns the live, non-deleted element count when nothing is selected", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const deleted = {
      ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }),
      isDeleted: true,
    }
    expect(computeStats([], [a, deleted])).toEqual({ kind: "scene", elementCount: 1 })
  })

  it("returns zero for an empty scene", () => {
    expect(computeStats([], [])).toEqual({ kind: "scene", elementCount: 0 })
  })
})

describe("computeStats — single selection", () => {
  it("returns the element's field values and converts angle from radians to degrees", () => {
    const el = newRectangle({ x: 10, y: 20, width: 30, height: 40, angle: Math.PI / 2 })
    expect(computeStats([el], [el])).toEqual({
      kind: "single",
      id: el.id,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      angleDeg: 90,
    })
  })

  it("a zero angle converts to 0 degrees", () => {
    const el = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const stats = computeStats([el], [el])
    expect(stats.kind).toBe("single")
    if (stats.kind === "single") expect(stats.angleDeg).toBe(0)
  })
})

describe("computeStats — multi selection", () => {
  it("matches getElementsBounds directly, including a rotated element", () => {
    const a = newRectangle({ x: 0, y: 0, width: 40, height: 20, angle: Math.PI / 2 })
    const b = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
    const selected = [a, b]
    const bounds = getElementsBounds(selected)!
    expect(computeStats(selected, selected)).toEqual({
      kind: "multi",
      count: 2,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    })
  })

  it("count reflects the number of selected elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const c = newRectangle({ x: 40, y: 0, width: 10, height: 10 })
    const stats = computeStats([a, b, c], [a, b, c])
    expect(stats.kind).toBe("multi")
    if (stats.kind === "multi") expect(stats.count).toBe(3)
  })
})
