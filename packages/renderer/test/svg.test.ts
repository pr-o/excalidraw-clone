import { Scene } from "@excalidraw-clone/scene"
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
})
