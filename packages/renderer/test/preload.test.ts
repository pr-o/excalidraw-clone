import { Scene } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { CanvasRenderer } from "../src/renderer"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

describe("CanvasRenderer.preloadImage", () => {
  it("accepts an id + dataURL without throwing", () => {
    const { canvas } = createMockCanvas()
    const scene = new Scene()
    const renderer = new CanvasRenderer(canvas, scene)
    expect(() => renderer.preloadImage("abc", "data:image/png;base64,iVBORw0KGgo=")).not.toThrow()
  })

  it("unloadImage forgets a previously preloaded image", () => {
    const { canvas } = createMockCanvas()
    const scene = new Scene()
    const renderer = new CanvasRenderer(canvas, scene)
    renderer.preloadImage("abc", "data:image/png;base64,iVBORw0KGgo=")
    expect(() => renderer.unloadImage("abc")).not.toThrow()
  })
})
