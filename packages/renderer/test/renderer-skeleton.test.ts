import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { callsOf, createMockCanvas } from "../src/test-utils/mock-canvas"

const flushFrame = (): void => {
  vi.advanceTimersByTime(20)
}

describe("CanvasRenderer skeleton", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("constructor stores canvas + scene; doesn't paint until start()", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    new CanvasRenderer(canvas, scene)
    expect(ctx.__calls.length).toBe(0)
  })

  it("start() schedules exactly one rAF callback", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    expect(ctx.__calls.length).toBe(0)
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(1)
    expect(callsOf(ctx, "fillRect").length).toBe(1)
  })

  it("light theme uses #ffffff background", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene, { theme: "light" })
    r.start()
    flushFrame()
    expect(ctx.__props.fillStyle).toBe("#ffffff")
  })

  it("dark theme uses #121212 background", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene, { theme: "dark" })
    r.start()
    flushFrame()
    expect(ctx.__props.fillStyle).toBe("#121212")
  })

  it("two requestRedraws coalesce into a single rAF", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    r.requestRedraw()
    r.requestRedraw()
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(1)
  })

  it("setTheme schedules a redraw", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flushFrame()
    const before = callsOf(ctx, "clearRect").length
    r.setTheme("dark")
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(before + 1)
  })

  it("setViewTransform/setSelection/setGrid each schedule a redraw", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flushFrame()
    const base = callsOf(ctx, "clearRect").length
    r.setViewTransform({ scrollX: 1, scrollY: 2, zoom: 1 })
    flushFrame()
    r.setSelection(["a"])
    flushFrame()
    r.setGrid({ enabled: true, size: 20 })
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(base + 3)
  })

  it("scene.mutate while running schedules a redraw", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flushFrame()
    const before = callsOf(ctx, "clearRect").length
    scene.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(before + 1)
  })

  it("stop() unsubscribes; subsequent mutations don't redraw", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flushFrame()
    const before = callsOf(ctx, "clearRect").length
    r.stop()
    scene.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(before)
  })

  it("requestRedraw after stop is a no-op", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene()
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flushFrame()
    const before = callsOf(ctx, "clearRect").length
    r.stop()
    r.requestRedraw()
    flushFrame()
    expect(callsOf(ctx, "clearRect").length).toBe(before)
  })
})
