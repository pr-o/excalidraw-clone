import {
  Scene,
  newArrow,
  newImage,
  newLabelForLinear,
  newRectangle,
  newText,
} from "@excalidraw-clone/scene"
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

  it("paints an occlusion rect behind an arrow label but not behind a shape label", () => {
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const arrowLabel = { ...newLabelForLinear(arrow), text: "yes" }
    const linkedArrow = { ...arrow, boundElements: [{ id: arrowLabel.id, type: "text" as const }] }

    const { canvas, ctx } = createMockCanvas()
    const scene = new Scene([linkedArrow, arrowLabel])
    const r = new CanvasRenderer(canvas, scene)
    r.start()
    flush()
    // one full-canvas background fill + one label backing rect
    expect(ctx.__calls.filter((c) => c.method === "fillRect")).toHaveLength(2)
    r.stop()

    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
    const shapeLabel = {
      ...newText({ x: 8, y: 8, width: 84, height: 64, text: "box", textAlign: "center" }),
      containerId: rect.id,
    }
    const linkedRect = { ...rect, boundElements: [{ id: shapeLabel.id, type: "text" as const }] }
    const { canvas: canvas2, ctx: ctx2 } = createMockCanvas()
    const r2 = new CanvasRenderer(canvas2, new Scene([linkedRect, shapeLabel]))
    r2.start()
    flush()
    // only the full-canvas background fill
    expect(ctx2.__calls.filter((c) => c.method === "fillRect")).toHaveLength(1)
    r2.stop()
  })

  it("shrinks a shape label to fit but leaves arrow labels and standalone text alone", () => {
    vi.spyOn(RoughCanvas.prototype, "draw").mockImplementation(() => undefined)
    // shape label: 21 chars → mock width 210; box width 84 → scale 0.4 → 8px
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
    const shapeLabel = {
      ...newText({
        x: 8,
        y: 8,
        width: 84,
        height: 64,
        text: "aaaaaaaaaaaaaaaaaaaaa",
        textAlign: "center",
      }),
      containerId: rect.id,
    }
    const linkedRect = { ...rect, boundElements: [{ id: shapeLabel.id, type: "text" as const }] }
    const { canvas, ctx } = createMockCanvas()
    const r = new CanvasRenderer(canvas, new Scene([linkedRect, shapeLabel]))
    r.start()
    flush()
    const fonts = ctx.__calls.filter((c) => c.method === "set:font").map((c) => c.args[0] as string)
    expect(fonts.some((f) => f.startsWith("8px"))).toBe(true)
    r.stop()

    // arrow label and standalone text stay at 20px
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const arrowLabel = { ...newLabelForLinear(arrow), text: "aaaaaaaaaaaaaaaaaaaaa" }
    const linkedArrow = { ...arrow, boundElements: [{ id: arrowLabel.id, type: "text" as const }] }
    const loose = newText({ x: 0, y: 0, width: 10, height: 10, text: "aaaaaaaaaaaaaaaaaaaaa" })
    const { canvas: canvas2, ctx: ctx2 } = createMockCanvas()
    const r2 = new CanvasRenderer(canvas2, new Scene([linkedArrow, arrowLabel, loose]))
    r2.start()
    flush()
    const fonts2 = ctx2.__calls
      .filter((c) => c.method === "set:font")
      .map((c) => c.args[0] as string)
    expect(fonts2.length).toBeGreaterThan(0)
    expect(fonts2.every((f) => f.startsWith("20px"))).toBe(true)
    r2.stop()
  })
})
