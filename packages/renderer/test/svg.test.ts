import { Scene, newImage } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { renderToSVG } from "../src/svg"

describe("renderToSVG", () => {
  it("returns an <svg> string for an empty scene", () => {
    const svg = renderToSVG(new Scene())
    expect(svg).toMatch(/<svg/)
  })

  it("includes background rect when opts.background is set", () => {
    const svg = renderToSVG(new Scene(), { background: "#ffffff" })
    expect(svg).toContain('fill="#ffffff"')
  })

  it("emits <image> with href/width/height when files provides the dataURL", () => {
    const el = newImage({ x: 5, y: 6, width: 80, height: 40, fileId: "f1" })
    const files = new Map([["f1", "data:image/png;base64,AAAA"]])
    const svg = renderToSVG(new Scene([el]), { files })
    expect(svg).toContain("<image")
    expect(svg).toContain('href="data:image/png;base64,AAAA"')
    expect(svg).toContain('width="80"')
    expect(svg).toContain('height="40"')
  })

  it("omits image elements whose file is not provided", () => {
    const el = newImage({ x: 5, y: 6, width: 80, height: 40, fileId: "f1" })
    const svg = renderToSVG(new Scene([el]))
    expect(svg).not.toContain("<image")
  })
})
