import { Scene, newImage, newRectangle, newText } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CanvasRenderer } from "../src"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const flush = (): void => {
  vi.advanceTimersByTime(20)
}

describe("renderer elements", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("calls roughCanvas.draw once per non-deleted rectangle", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas()
    const scene = new Scene([
      newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      newRectangle({ x: 20, y: 20, width: 10, height: 10 }),
    ])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flush()
    expect(drawSpy).toHaveBeenCalledTimes(2)
  })

  it("skips deleted elements", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas()
    const live = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 20, y: 20, width: 10, height: 10 }), isDeleted: true }
    const scene = new Scene([live, dead])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flush()
    expect(drawSpy).toHaveBeenCalledTimes(1)
  })

  it("image elements without a loaded file record no rough draw", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas()
    const scene = new Scene([
      newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      newImage({ x: 20, y: 20, width: 50, height: 50 }),
    ])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flush()
    expect(drawSpy).toHaveBeenCalledTimes(1)
  })

  it("draws elements in scene array order (z-order)", () => {
    const order: number[] = []
    let i = 0
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => {
      order.push(i++)
    })
    const { canvas } = createMockCanvas()
    const scene = new Scene([
      newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      newRectangle({ x: 5, y: 5, width: 10, height: 10 }),
      newRectangle({ x: 9, y: 9, width: 10, height: 10 }),
    ])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flush()
    expect(order).toEqual([0, 1, 2])
  })

  it("translates ctx.save/translate/restore around each element", () => {
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene([newRectangle({ x: 7, y: 9, width: 10, height: 10 })])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flush()
    const saves = ctx.__calls.filter((c) => c.method === "save").length
    const restores = ctx.__calls.filter((c) => c.method === "restore").length
    const translates = ctx.__calls.filter((c) => c.method === "translate")
    expect(saves).toBe(1)
    expect(restores).toBe(1)
    expect(translates[0]?.args).toEqual([7, 9])
  })

  it("draws elements with dark-resolved colors when theme is dark", () => {
    const drawSpy = vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const { canvas } = createMockCanvas()
    const scene = new Scene([
      { ...newRectangle({ x: 10, y: 10, width: 50, height: 50 }), strokeColor: "#1e1e1e" },
    ])
    const r = new CanvasRenderer(canvas, scene, { theme: "dark" })
    r.start()
    flush()
    expect(drawSpy).toHaveBeenCalledTimes(1)
    const drawable = drawSpy.mock.calls[0]![0] as { options: { stroke: string } }
    expect(drawable.options.stroke).toBe("#ececec")
    r.stop()
  })

  it("draws text with the dark-resolved fill", () => {
    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene([{ ...newText({ x: 10, y: 10, text: "hi" }), strokeColor: "#1e1e1e" }])
    const r = new CanvasRenderer(canvas, scene, { theme: "dark" })
    r.start()
    flush()
    const fills = ctx.__calls.filter((c) => c.method === "set:fillStyle").map((c) => c.args[0])
    expect(fills).toContain("#ececec")
    r.stop()
  })
})
