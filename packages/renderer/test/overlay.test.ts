import { Scene, newArrow, newRectangle } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const flush = (): void => {
  vi.advanceTimersByTime(20)
}

describe("CanvasRenderer selection overlay", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("no selection + no marquee → no chrome strokes/fills on main canvas", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene())
    r.start()
    flush()
    const strokeRectCount = ctx.__calls.filter((c) => c.method === "strokeRect").length
    const fillRectCount = ctx.__calls.filter((c) => c.method === "fillRect").length
    expect(strokeRectCount).toBe(0)
    // Only background fillRect.
    expect(fillRectCount).toBe(1)
  })

  it("single selected rectangle → 1 bbox stroke + 8 handles + 1 rotation arc on overlay", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 50 })
    const scene = new Scene([rect])
    const r = new CanvasRenderer(main, scene, {
      overlayCanvas: overlay,
      selection: [rect.id],
    })
    r.start()
    flush()
    const strokeBox = overlayCtx.__calls.filter((c) => c.method === "stroke").length
    const fillRectCalls = overlayCtx.__calls.filter((c) => c.method === "fillRect").length
    const strokeRectCalls = overlayCtx.__calls.filter((c) => c.method === "strokeRect").length
    const arcCalls = overlayCtx.__calls.filter((c) => c.method === "arc").length
    expect(fillRectCalls).toBe(8)
    expect(strokeRectCalls).toBe(8)
    expect(strokeBox).toBeGreaterThanOrEqual(1)
    expect(arcCalls).toBe(1)
  })

  it("two selected rectangles → 16 handle fillRects + 2 rotation arcs", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const a = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const b = newRectangle({ x: 100, y: 100, width: 50, height: 50 })
    const scene = new Scene([a, b])
    const r = new CanvasRenderer(main, scene, {
      overlayCanvas: overlay,
      selection: [a.id, b.id],
    })
    r.start()
    flush()
    const fillRectCalls = overlayCtx.__calls.filter((c) => c.method === "fillRect").length
    const arcCalls = overlayCtx.__calls.filter((c) => c.method === "arc").length
    expect(fillRectCalls).toBe(16)
    expect(arcCalls).toBe(2)
  })

  it("single selected arrow → 2 endpoint dots, no rotation arc, no bbox stroke", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      width: 100,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const scene = new Scene([arrow])
    const r = new CanvasRenderer(main, scene, { overlayCanvas: overlay, selection: [arrow.id] })
    r.start()
    flush()
    expect(overlayCtx.__calls.filter((c) => c.method === "fillRect").length).toBe(2)
    expect(overlayCtx.__calls.filter((c) => c.method === "arc").length).toBe(0)
  })

  it("single selected 3-point arrow → 3 solid dots + 2 ghost dots, no arc", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      width: 200,
      height: 100,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 0 },
      ],
    }
    const scene = new Scene([arrow])
    const r = new CanvasRenderer(main, scene, { overlayCanvas: overlay, selection: [arrow.id] })
    r.start()
    flush()
    // one fillRect per real point (solid handles); ghosts are stroke-only
    expect(overlayCtx.__calls.filter((c) => c.method === "fillRect").length).toBe(3)
    // 3 solid handle strokes + 2 segment-midpoint ghost strokes
    expect(overlayCtx.__calls.filter((c) => c.method === "strokeRect").length).toBe(5)
    expect(overlayCtx.__calls.filter((c) => c.method === "arc").length).toBe(0)
  })

  it("marquee uses dashed stroke", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const r = new CanvasRenderer(main, new Scene(), { overlayCanvas: overlay })
    r.start()
    flush()
    r.setMarquee({ start: { x: 0, y: 0 }, end: { x: 100, y: 100 } })
    flush()
    const setLineDashCalls = overlayCtx.__calls.filter((c) => c.method === "setLineDash")
    expect(
      setLineDashCalls.some((c) => Array.isArray(c.args[0]) && (c.args[0] as number[]).length > 0),
    ).toBe(true)
  })

  it("when no overlay canvas, selection chrome draws on main canvas", () => {
    const { canvas, ctx } = createMockCanvas()
    const rect = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const scene = new Scene([rect])
    const r = new CanvasRenderer(canvas, scene, { selection: [rect.id] })
    r.start()
    flush()
    const fillRects = ctx.__calls.filter((c) => c.method === "fillRect").length
    expect(fillRects).toBe(1 + 8) // background + 8 handles
  })

  it("binding highlight strokes a box for a highlighted element with no selection", () => {
    const { canvas: main } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const scene = new Scene([rect])
    const r = new CanvasRenderer(main, scene, { overlayCanvas: overlay })
    r.start()
    flush()
    expect(overlayCtx.__calls.filter((c) => c.method === "strokeRect").length).toBe(0)
    r.setBindingHighlight([rect.id])
    flush()
    expect(
      overlayCtx.__calls.filter((c) => c.method === "strokeRect").length,
    ).toBeGreaterThanOrEqual(1)
  })

  it("overlay clears its own canvas; main canvas is not cleared by chrome pass", () => {
    const { canvas: main, ctx: mainCtx } = createMockCanvas()
    const { canvas: overlay, ctx: overlayCtx } = createMockCanvas()
    const rect = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const scene = new Scene([rect])
    const r = new CanvasRenderer(main, scene, {
      overlayCanvas: overlay,
      selection: [rect.id],
    })
    r.start()
    flush()
    expect(mainCtx.__calls.filter((c) => c.method === "clearRect").length).toBe(1)
    expect(overlayCtx.__calls.filter((c) => c.method === "clearRect").length).toBe(1)
  })
})
