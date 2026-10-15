import { viewportToScene, ZOOM_MAX, ZOOM_MIN } from "@excalidraw-clone/geometry"
import { describe, expect, it } from "vitest"
import { pinchView } from "../src/driver/pinch"

const start = { scrollX: 10, scrollY: -20, zoom: 1 }
const p = (x: number, y: number) => ({ x, y })

describe("pinchView", () => {
  it("equal distance = pure pan by the midpoint travel", () => {
    const v = pinchView(start, [p(100, 100), p(200, 100)], [p(130, 120), p(230, 120)])
    expect(v.zoom).toBe(1)
    expect(v.scrollX).toBeCloseTo(40)
    expect(v.scrollY).toBeCloseTo(0)
  })

  it("spreading doubles zoom and keeps the scene point under the midpoint", () => {
    const from = [p(100, 100), p(200, 100)] as const
    const to = [p(50, 100), p(250, 100)] as const
    const v = pinchView(start, from, to)
    expect(v.zoom).toBeCloseTo(2)
    const before = viewportToScene(p(150, 100), start)
    const after = viewportToScene(p(150, 100), v)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it("clamps zoom to the global limits", () => {
    expect(pinchView(start, [p(0, 0), p(1, 0)], [p(0, 0), p(1000, 0)]).zoom).toBe(ZOOM_MAX)
    expect(pinchView(start, [p(0, 0), p(1000, 0)], [p(0, 0), p(1, 0)]).zoom).toBe(ZOOM_MIN)
  })

  it("coincident starting fingers do not produce NaN", () => {
    const v = pinchView(start, [p(5, 5), p(5, 5)], [p(5, 5), p(9, 5)])
    expect(Number.isFinite(v.zoom)).toBe(true)
  })
})
