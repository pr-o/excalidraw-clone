import { newRectangle, newText } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { describe, expect, it } from "vitest"
import { drawElement } from "../src/draw-element"
import { ShapeCache } from "../src/shape-cache"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const draw = (el: ExcalidrawElement) => {
  const { canvas, ctx } = createMockCanvas()
  drawElement(
    ctx as unknown as CanvasRenderingContext2D,
    el,
    new RoughCanvas(canvas),
    new ShapeCache(),
    () => undefined,
  )
  return ctx
}
const alphas = (ctx: ReturnType<typeof draw>) =>
  ctx.__calls.filter((c) => c.method === "set:globalAlpha").map((c) => c.args[0])

describe("element opacity (canvas)", () => {
  it("paints a shape at its opacity and restores the context afterwards", () => {
    const ctx = draw({ ...newRectangle({ x: 0, y: 0, width: 50, height: 50 }), opacity: 40 })
    expect(alphas(ctx)).toEqual([0.4])
    const calls = ctx.__calls.map((c) => c.method)
    expect(calls.indexOf("save")).toBeLessThan(calls.indexOf("set:globalAlpha"))
    expect(calls.at(-1)).toBe("restore")
  })

  it("applies to text too", () => {
    const ctx = draw({ ...newText({ x: 0, y: 0, text: "hi" }), opacity: 25 })
    expect(alphas(ctx)).toEqual([0.25])
  })

  it("leaves fully opaque elements alone", () => {
    const ctx = draw(newRectangle({ x: 0, y: 0, width: 50, height: 50 }))
    expect(alphas(ctx)).toEqual([])
  })
})
