import { Scene } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { CanvasRenderer, preloadSharedImage } from "../src/renderer"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const DATA = "data:image/png;base64,iVBORw0KGgo="

describe("CanvasRenderer.preloadImage", () => {
  it("returns a promise and is idempotent per fileId", () => {
    const { canvas } = createMockCanvas()
    const renderer = new CanvasRenderer(canvas, new Scene())
    const p1 = renderer.preloadImage("abc", DATA)
    const p2 = renderer.preloadImage("abc", DATA)
    expect(p1).toBeInstanceOf(Promise)
    expect(p2).toBe(p1)
  })

  it("unloadImage forgets the image so preloadImage starts a fresh load", () => {
    const { canvas } = createMockCanvas()
    const renderer = new CanvasRenderer(canvas, new Scene())
    const p1 = renderer.preloadImage("abc", DATA)
    renderer.unloadImage("abc")
    const p2 = renderer.preloadImage("abc", DATA)
    expect(p2).not.toBe(p1)
  })

  it("shares decoded images across renderers and the standalone preloader", () => {
    const a = new CanvasRenderer(createMockCanvas().canvas, new Scene())
    const b = new CanvasRenderer(createMockCanvas().canvas, new Scene())
    const first = a.preloadImage("shared-1", DATA)
    // A second renderer (another page) and the free function reuse the same load.
    expect(b.preloadImage("shared-1", DATA)).toBe(first)
    expect(preloadSharedImage("shared-1", DATA)).toBe(first)
  })
})
