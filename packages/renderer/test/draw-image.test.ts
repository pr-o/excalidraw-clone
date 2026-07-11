import { newImage } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { describe, expect, it } from "vitest"
import { drawElement } from "../src/draw-element"
import { ShapeCache } from "../src/shape-cache"
import { callsOf, createMockCanvas } from "../src/test-utils/mock-canvas"

const loadedImage = (): HTMLImageElement =>
  ({ complete: true, naturalWidth: 8, naturalHeight: 8 }) as unknown as HTMLImageElement

const setup = (): {
  ctx: ReturnType<typeof createMockCanvas>["ctx"]
  draw: (el: Parameters<typeof drawElement>[1], getImage: Parameters<typeof drawElement>[4]) => void
} => {
  const { canvas, ctx } = createMockCanvas()
  const rough = new RoughCanvas(canvas)
  const cache = new ShapeCache()
  return {
    ctx,
    draw: (el, getImage) =>
      drawElement(ctx as unknown as CanvasRenderingContext2D, el, rough, cache, getImage),
  }
}

describe("drawElement image branch", () => {
  it("draws a loaded image at the local origin with element size", () => {
    const { ctx, draw } = setup()
    const img = loadedImage()
    draw(newImage({ x: 30, y: 40, width: 200, height: 100, fileId: "f1" }), () => img)
    const calls = callsOf(ctx, "drawImage")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual([img, 0, 0, 200, 100])
    expect(callsOf(ctx, "translate")[0]?.args).toEqual([30, 40])
  })

  it("rotates around the element center before drawing", () => {
    const { ctx, draw } = setup()
    const el = {
      ...newImage({ x: 0, y: 0, width: 100, height: 50, fileId: "f1" }),
      angle: Math.PI / 2,
    }
    draw(el, () => loadedImage())
    expect(callsOf(ctx, "rotate")[0]?.args).toEqual([Math.PI / 2])
    expect(callsOf(ctx, "drawImage")).toHaveLength(1)
  })

  it("skips when fileId is null", () => {
    const { ctx, draw } = setup()
    draw(newImage({ x: 0, y: 0, width: 100, height: 100 }), () => loadedImage())
    expect(callsOf(ctx, "drawImage")).toHaveLength(0)
  })

  it("skips when the lookup has no image for the fileId", () => {
    const { ctx, draw } = setup()
    draw(newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" }), () => undefined)
    expect(callsOf(ctx, "drawImage")).toHaveLength(0)
  })

  it("skips when the image has not finished loading", () => {
    const { ctx, draw } = setup()
    const pending = { complete: false, naturalWidth: 0 } as unknown as HTMLImageElement
    draw(newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" }), () => pending)
    expect(callsOf(ctx, "drawImage")).toHaveLength(0)
  })

  it("balances save/restore even when the image is skipped", () => {
    const { ctx, draw } = setup()
    draw(newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" }), () => undefined)
    expect(callsOf(ctx, "save")).toHaveLength(1)
    expect(callsOf(ctx, "restore")).toHaveLength(1)
  })
})
