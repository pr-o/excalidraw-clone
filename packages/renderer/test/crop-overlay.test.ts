import { newImage } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { drawCropDim } from "../src/crop-overlay"
import { callsOf, createMockCanvas } from "../src/test-utils/mock-canvas"

const img = { complete: true, naturalWidth: 8, naturalHeight: 8 } as unknown as HTMLImageElement

describe("drawCropDim", () => {
  it("draws the full image offset by the crop, clipped to the ring outside the box", () => {
    const { ctx } = createMockCanvas()
    const el = {
      ...newImage({ x: 10, y: 20, width: 80, height: 40, fileId: "f1" }),
      crop: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 },
    }
    drawCropDim(ctx as unknown as CanvasRenderingContext2D, el, img, {
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
    })
    // kx = 160, ky = 80 → full image at (-40,-40) 160x80 in element-local space
    expect(callsOf(ctx, "drawImage")[0]?.args).toEqual([img, -40, -40, 160, 80])
    expect(callsOf(ctx, "clip")).toHaveLength(1)
    expect(callsOf(ctx, "rect").map((c) => c.args)).toEqual([
      [-40, -40, 160, 80],
      [0, 0, 80, 40],
    ])
  })
})
