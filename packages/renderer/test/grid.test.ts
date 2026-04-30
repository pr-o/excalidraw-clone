import { Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const flush = (): void => {
  vi.advanceTimersByTime(20)
}

describe("CanvasRenderer grid", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("grid disabled → no stroke from grid pass", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene())
    r.start()
    flush()
    expect(ctx.__calls.filter((c) => c.method === "stroke").length).toBe(0)
  })

  it("grid enabled at zoom 1 produces a stroke call", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene(), {
      grid: { enabled: true, size: 20 },
    })
    r.start()
    flush()
    expect(ctx.__calls.filter((c) => c.method === "stroke").length).toBe(1)
  })

  it("grid lines respect viewport bounds: 800x600 / size 100 → ~9 vertical and ~7 horizontal moveTo (one per line)", () => {
    const { canvas, ctx } = createMockCanvas(800, 600)
    const r = new CanvasRenderer(canvas, new Scene(), {
      grid: { enabled: true, size: 100 },
    })
    r.start()
    flush()
    const moveTos = ctx.__calls.filter((c) => c.method === "moveTo").length
    expect(moveTos).toBe(9 + 7)
  })

  it("light theme uses #dddddd grid color", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene(), {
      grid: { enabled: true, size: 50 },
      theme: "light",
    })
    r.start()
    flush()
    expect(ctx.__props.strokeStyle).toBe("#dddddd")
  })

  it("dark theme uses #2a2a2a grid color", () => {
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene(), {
      grid: { enabled: true, size: 50 },
      theme: "dark",
    })
    r.start()
    flush()
    expect(ctx.__props.strokeStyle).toBe("#2a2a2a")
  })
})
