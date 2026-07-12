import { Scene, newArrow, newRectangle } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { CULL_MARGIN, isElementVisible } from "../src/culling"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const VIEW = { x: 0, y: 0, width: 800, height: 600 }

describe("isElementVisible", () => {
  it("keeps an element inside the view", () => {
    expect(isElementVisible(newRectangle({ x: 100, y: 100, width: 50, height: 50 }), VIEW)).toBe(
      true,
    )
  })

  it("culls an element fully left of the view", () => {
    expect(isElementVisible(newRectangle({ x: -500, y: 100, width: 100, height: 50 }), VIEW)).toBe(
      false,
    )
  })

  it("keeps an element partially overlapping the view edge", () => {
    expect(isElementVisible(newRectangle({ x: -25, y: 100, width: 50, height: 50 }), VIEW)).toBe(
      true,
    )
  })

  it("honors the margin at the boundary", () => {
    const touching = newRectangle({ x: -100 - CULL_MARGIN, y: 100, width: 100, height: 50 })
    const beyond = newRectangle({ x: -101 - CULL_MARGIN, y: 100, width: 100, height: 50 })
    expect(isElementVisible(touching, VIEW)).toBe(true)
    expect(isElementVisible(beyond, VIEW)).toBe(false)
  })

  it("keeps a rotated element whose rotated bounds reach the view", () => {
    // Unrotated AABB [840,860]×[100,500] is right of the view; rotated 90°
    // about its center (850, 300) it spans x [650,1050] and overlaps.
    const base = newRectangle({ x: 840, y: 100, width: 20, height: 400 })
    expect(isElementVisible(base, VIEW)).toBe(false)
    expect(isElementVisible({ ...base, angle: Math.PI / 2 }, VIEW)).toBe(true)
  })

  it("uses point bounds for linear elements whose points exceed the box", () => {
    const arrow = {
      ...newArrow({ x: 900, y: 300, width: 10, height: 10 }),
      points: [
        { x: 0, y: 0 },
        { x: -300, y: 0 },
      ],
    }
    expect(isElementVisible(arrow, VIEW)).toBe(true)
  })

  it("rotates linear-element points when computing visibility", () => {
    const base = {
      ...newArrow({ x: 900, y: 300, width: 10, height: 10 }),
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    }
    // Unrotated point-bounds [900,1200]×[300,300] sit right of the view.
    expect(isElementVisible(base, VIEW)).toBe(false)
    // Rotated 180° about the element center (905,305), the points map to
    // (910,310) and (610,310) — the bounds reach back into the view.
    expect(isElementVisible({ ...base, angle: Math.PI }, VIEW)).toBe(true)
  })
})

describe("CanvasRenderer culling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("skips off-screen elements in render()", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas()
    const scene = new Scene([
      newRectangle({ x: 10, y: 10, width: 20, height: 20 }),
      newRectangle({ x: 5000, y: 5000, width: 20, height: 20 }),
    ])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    vi.advanceTimersByTime(20)
    expect(drawSpy).toHaveBeenCalledTimes(1)
  })

  it("culls against the scrolled/zoomed view, not the default one", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas() // 800×600
    const scene = new Scene([
      // In world view [900,1300]×[450,750] at scroll(-900,-450), zoom 2 → drawn.
      newRectangle({ x: 1000, y: 500, width: 50, height: 50 }),
      // At the default identity view this one WOULD be drawn — but not here.
      newRectangle({ x: 100, y: 100, width: 50, height: 50 }),
    ])
    const r = new CanvasRenderer(canvas, scene, {
      viewTransform: { scrollX: -900, scrollY: -450, zoom: 2 },
    })
    r.start()
    vi.advanceTimersByTime(20)
    expect(drawSpy).toHaveBeenCalledTimes(1)
  })
})
