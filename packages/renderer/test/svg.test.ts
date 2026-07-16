import { Scene, newImage, newRectangle, newText, newTriangle } from "@excalidraw-clone/scene"
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

describe("renderToSVG theming", () => {
  it("resolves element and background colors in dark theme", () => {
    const scene = new Scene([
      { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#1e1e1e" },
    ])
    const svg = renderToSVG(scene, { background: "#ffffff", theme: "dark" })
    expect(svg).toContain("#ececec") // inverted stroke
    expect(svg).toContain('fill="#1e1e1e"') // inverted background rect
    expect(svg).not.toContain('stroke="#1e1e1e"')
  })

  it("keeps light output unchanged", () => {
    const scene = new Scene([
      { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), strokeColor: "#1e1e1e" },
    ])
    expect(renderToSVG(scene, { background: "#ffffff" })).toBe(
      renderToSVG(scene, { background: "#ffffff", theme: "light" }),
    )
  })

  it("resolves text fill in dark theme", () => {
    const scene = new Scene([{ ...newText({ x: 0, y: 0, text: "hi" }), strokeColor: "#1e1e1e" }])
    const svg = renderToSVG(scene, { theme: "dark" })
    expect(svg).toContain('fill="#ececec"')
  })
})

describe("renderToSVG flowchart shapes", () => {
  it("renders a triangle as rough path markup inside a positioned group", () => {
    const scene = new Scene([newTriangle({ x: 3, y: 4, width: 40, height: 30 })])
    const svg = renderToSVG(scene)
    expect(svg).toContain('transform="translate(3 4)"')
    expect(svg).toContain("path")
  })
})
