import { Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const flush = (): void => {
  vi.advanceTimersByTime(20)
}

const setTransformCalls = (
  ctx: ReturnType<typeof createMockCanvas>["ctx"],
): readonly (readonly unknown[])[] =>
  ctx.__calls.filter((c) => c.method === "setTransform").map((c) => c.args)

describe("CanvasRenderer view transform", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("identity: setTransform(1,0,0,1,0,0)", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene())
    r.start()
    flush()
    const calls = setTransformCalls(ctx)
    expect(calls).toContainEqual([1, 0, 0, 1, 0, 0])
  })

  it("zoom 2 + scroll (10,20): setTransform(2,0,0,2,20,40)", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene(), {
      viewTransform: { scrollX: 10, scrollY: 20, zoom: 2 },
    })
    r.start()
    flush()
    const calls = setTransformCalls(ctx)
    expect(calls).toContainEqual([2, 0, 0, 2, 20, 40])
  })

  it("setViewTransform schedules redraw with new matrix", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene())
    r.start()
    flush()
    r.setViewTransform({ scrollX: 5, scrollY: 0, zoom: 3 })
    flush()
    expect(setTransformCalls(ctx)).toContainEqual([3, 0, 0, 3, 15, 0])
  })

  it("clearRect happens before the view-transform setTransform", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene(), {
      viewTransform: { scrollX: 10, scrollY: 0, zoom: 2 },
    })
    r.start()
    flush()
    const idx = ctx.__calls
    const clearIdx = idx.findIndex((c) => c.method === "clearRect")
    const lastSetTransform = idx
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.method === "setTransform")
      .pop()!.i
    expect(clearIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeLessThan(lastSetTransform)
  })
})
