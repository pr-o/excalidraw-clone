import { newRectangle, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import {
  renderPageThumbnail,
  THUMBNAIL_CAPTURE_SCALE,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from "../src/driver/pageThumbnails"

function createStubContext(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      if (prop === "measureText") return (text: string) => ({ width: String(text).length * 6 })
      if (
        prop === "createLinearGradient" ||
        prop === "createRadialGradient" ||
        prop === "createPattern"
      ) {
        return () => ({ addColorStop: () => undefined })
      }
      return () => undefined
    },
    set(target, prop, value) {
      target[prop as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

describe("renderPageThumbnail", () => {
  let capturedCanvases: HTMLCanvasElement[]
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  let toDataURLSpy: MockInstance<typeof HTMLCanvasElement.prototype.toDataURL>

  beforeEach(() => {
    capturedCanvases = []
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(function (this: HTMLCanvasElement) {
        capturedCanvases.push(this)
        return createStubContext()
      })
    toDataURLSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,MOCKED")
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    toDataURLSpy.mockRestore()
  })

  it("returns undefined for an empty scene without invoking the renderer", async () => {
    const scene = new Scene()
    const result = await renderPageThumbnail(scene, "#ffffff", "light")
    expect(result).toBeUndefined()
    expect(getContextSpy).not.toHaveBeenCalled()
  })

  it("returns a PNG data URL for a non-empty scene", async () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 40, height: 40 })])
    const result = await renderPageThumbnail(scene, "#ffffff", "light")
    expect(result).toBe("data:image/png;base64,MOCKED")
    expect(getContextSpy).toHaveBeenCalled()
    expect(toDataURLSpy).toHaveBeenCalledWith("image/png")
  })

  it("fits the canvas to the fixed thumbnail size regardless of element aspect ratio (letterboxed)", async () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 2000, height: 20 })])
    await renderPageThumbnail(scene, "#ffffff", "light")
    expect(capturedCanvases.length).toBeGreaterThan(0)
    for (const canvas of capturedCanvases) {
      expect(canvas.width).toBe(THUMBNAIL_WIDTH * THUMBNAIL_CAPTURE_SCALE)
      expect(canvas.height).toBe(THUMBNAIL_HEIGHT * THUMBNAIL_CAPTURE_SCALE)
    }
  })
})
