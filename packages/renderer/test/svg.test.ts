import {
  Scene,
  newArrow,
  newFrame,
  newImage,
  newLabelForLinear,
  newRectangle,
  newText,
  newTriangle,
} from "@excalidraw-clone/scene"
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

describe("renderToSVG linear label backing", () => {
  const stubMeasure = (
    text: string,
    fontSize: number,
    _family: number,
    lineHeight: number,
  ): { width: number; height: number } => ({
    width: text.length * 10,
    height: fontSize * lineHeight,
  })

  const labeledArrowScene = (): Scene => {
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const label = { ...newLabelForLinear(arrow), text: "yes" }
    return new Scene([
      { ...arrow, boundElements: [{ id: label.id, type: "text" as const }] },
      label,
    ])
  }

  it("emits a backing rect behind an arrow label", () => {
    const svg = renderToSVG(labeledArrowScene(), { measure: stubMeasure })
    // "yes" → 30 wide; height 25; padding 4 → 38 × 33
    expect(svg).toContain('width="38"')
    expect(svg).toContain('height="33"')
    expect(svg).toContain('fill="#ffffff"')
  })

  it("emits no backing rect for a shape label", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
    const label = {
      ...newText({ x: 8, y: 8, width: 84, height: 64, text: "box" }),
      containerId: rect.id,
    }
    const scene = new Scene([
      { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
      label,
    ])
    const svg = renderToSVG(scene, { measure: stubMeasure })
    expect(svg).not.toContain("<rect")
  })

  it("skips the backing gracefully when no measurer is available", () => {
    // jsdom's canvas.getContext returns null → default measurer unavailable
    const svg = renderToSVG(labeledArrowScene())
    expect(svg).toContain("yes")
    expect(svg).not.toContain("<rect")
  })
})

describe("renderToSVG shape label auto-shrink", () => {
  const stubMeasure = (
    text: string,
    fontSize: number,
    _family: number,
    lineHeight: number,
  ): { width: number; height: number } => ({
    width: text.length * 10,
    height: fontSize * lineHeight,
  })

  const labeledRectScene = (text: string): Scene => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 80 })
    const label = {
      ...newText({ x: 8, y: 8, width: 84, height: 64, text, textAlign: "center" }),
      containerId: rect.id,
    }
    return new Scene([{ ...rect, boundElements: [{ id: label.id, type: "text" as const }] }, label])
  }

  it("emits a scaled font-size for a label wider than its box", () => {
    // 21 chars → 210 wide; box 84 → scale 0.4 → font-size 8
    const svg = renderToSVG(labeledRectScene("aaaaaaaaaaaaaaaaaaaaa"), { measure: stubMeasure })
    expect(svg).toContain('font-size="8"')
    expect(svg).not.toContain('font-size="20"')
  })

  it("keeps the natural font-size when the label fits", () => {
    const svg = renderToSVG(labeledRectScene("box"), { measure: stubMeasure })
    expect(svg).toContain('font-size="20"')
  })

  it("keeps the natural font-size when no measurer is available", () => {
    // jsdom's canvas.getContext returns null → default measurer unavailable
    const svg = renderToSVG(labeledRectScene("aaaaaaaaaaaaaaaaaaaaa"))
    expect(svg).toContain('font-size="20"')
  })

  it("wraps a two-word label into two tspans at natural size", () => {
    // "hello world" → 110 wide; box 84 → wraps, both lines fit → font-size 20
    const svg = renderToSVG(labeledRectScene("hello world"), { measure: stubMeasure })
    expect(svg.match(/<tspan/g)).toHaveLength(2)
    expect(svg).toContain('font-size="20"')
  })

  it("does not wrap when no measurer is available", () => {
    const svg = renderToSVG(labeledRectScene("hello world"))
    expect(svg.match(/<tspan/g)).toHaveLength(1)
    expect(svg).toContain('font-size="20"')
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

describe("renderToSVG frame names", () => {
  it("emits a <text> node with the default name inside the frame group", () => {
    const scene = new Scene([newFrame({ x: 5, y: 6, width: 100, height: 80 })])
    const svg = renderToSVG(scene)
    expect(svg).toContain('transform="translate(5 6)"')
    expect(svg).toContain(">Frame</text>")
    expect(svg).toContain('font-size="12"')
    expect(svg).toContain('fill="#868e96"')
  })

  it("emits the frame's own name when set", () => {
    const frame = { ...newFrame({ x: 0, y: 0, width: 100, height: 80 }), name: "Login flow" }
    const svg = renderToSVG(new Scene([frame]))
    expect(svg).toContain(">Login flow</text>")
  })
})
