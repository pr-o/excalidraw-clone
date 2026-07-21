import {
  sceneToViewport,
  viewportToScene,
  ZOOM_MAX,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import { describe, expect, it } from "vitest"
import { applyWheel } from "../src/driver/events"

const fakeCanvas = (rect: { left: number; top: number }): HTMLCanvasElement =>
  ({
    getBoundingClientRect: () =>
      ({
        left: rect.left,
        top: rect.top,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: rect.left,
        y: rect.top,
        toJSON: () => "",
      }) as DOMRect,
  }) as unknown as HTMLCanvasElement

describe("applyWheel", () => {
  it("plain wheel pans without changing zoom", () => {
    const canvas = fakeCanvas({ left: 0, top: 0 })
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 2 }
    const next = applyWheel(canvas, view, {
      clientX: 0,
      clientY: 0,
      deltaX: 10,
      deltaY: 20,
      ctrlKey: false,
    })
    expect(next).toEqual({ scrollX: -5, scrollY: -10, zoom: 2 })
  })

  it("ctrl+wheel zoom keeps the cursor's scene point fixed, accounting for canvas offset", () => {
    const canvas = fakeCanvas({ left: 100, top: 40 })
    const view: ViewTransform = { scrollX: 3, scrollY: -2, zoom: 1 }
    const anchorLocal = { x: 50, y: 50 } // clientX/Y (150,90) minus the (100,40) canvas offset
    const scenePointBefore = viewportToScene(anchorLocal, view)
    const next = applyWheel(canvas, view, {
      clientX: 150,
      clientY: 90,
      deltaX: 0,
      deltaY: -10,
      ctrlKey: true,
    })
    expect(next.zoom).toBeGreaterThan(1)
    const backToViewport = sceneToViewport(scenePointBefore, next)
    expect(backToViewport.x).toBeCloseTo(anchorLocal.x)
    expect(backToViewport.y).toBeCloseTo(anchorLocal.y)
  })

  it("ctrl+wheel with a positive deltaY zooms out", () => {
    const canvas = fakeCanvas({ left: 0, top: 0 })
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const next = applyWheel(canvas, view, {
      clientX: 50,
      clientY: 50,
      deltaX: 0,
      deltaY: 10,
      ctrlKey: true,
    })
    expect(next.zoom).toBeLessThan(1)
  })

  it("clamps zoom at ZOOM_MAX for a large negative deltaY", () => {
    const canvas = fakeCanvas({ left: 0, top: 0 })
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const next = applyWheel(canvas, view, {
      clientX: 0,
      clientY: 0,
      deltaX: 0,
      deltaY: -1000,
      ctrlKey: true,
    })
    expect(next.zoom).toBe(ZOOM_MAX)
  })
})
