import { Scene, newTable, setCellText } from "@excalidraw-clone/scene"
import type { ExcalidrawTableElement } from "@excalidraw-clone/scene"
import { RoughCanvas } from "roughjs/bin/canvas"
import { describe, expect, it } from "vitest"
import { drawElement } from "../src/draw-element"
import { ShapeCache } from "../src/shape-cache"
import { generateShape } from "../src/shapes"
import { headerTint, layoutTableCells } from "../src/shapes/table"
import { renderToSVG } from "../src/svg"
import { callsOf, createMockCanvas } from "../src/test-utils/mock-canvas"

const base = (patch: Partial<ExcalidrawTableElement> = {}): ExcalidrawTableElement => ({
  ...newTable({ x: 10, y: 20 }),
  ...patch,
})

const draw = (el: ExcalidrawTableElement, hiddenCell?: { row: number; col: number }) => {
  const { canvas, ctx } = createMockCanvas()
  drawElement(
    ctx as unknown as CanvasRenderingContext2D,
    el,
    new RoughCanvas(canvas),
    new ShapeCache(),
    () => undefined,
    "light",
    hiddenCell ? { hiddenCell } : undefined,
  )
  return ctx
}

const gen = () => new RoughCanvas(createMockCanvas().canvas).generator

describe("tableShape", () => {
  it("emits border + one line per interior border (+ header tint)", () => {
    // header tint, outer border, 2 column lines, 2 row lines
    expect(generateShape(base(), gen())).toHaveLength(6)
    expect(generateShape(base({ headerRow: false }), gen())).toHaveLength(5)
    // a background fill adds one more
    expect(generateShape(base({ backgroundColor: "#a5d8ff" }), gen())).toHaveLength(7)
  })

  it("scales the line count with rows and cols", () => {
    const t = newTable({ x: 0, y: 0, rows: 5, cols: 2 })
    // header tint + border + 1 column line + 4 row lines
    expect(generateShape(t, gen())).toHaveLength(7)
  })

  it("tints the header with the stroke colour at 12% alpha", () => {
    expect(headerTint("#1e1e1e")).toBe("rgba(30,30,30,0.12)")
    expect(headerTint("#ececec")).toBe("rgba(236,236,236,0.12)")
    expect(headerTint("nonsense")).toContain("0.12")
  })
})

describe("table text layout", () => {
  const measure = (s: string) => s.length * 10
  it("centres a one-line cell vertically and anchors by textAlign", () => {
    const t = setCellText(base(), 1, 1, "hi")
    const [line] = layoutTableCells(t, measure)
    // row 1 spans y 40..80; 25px line centred => top 47.5
    expect(line).toMatchObject({ row: 1, col: 1, text: "hi", x: 128, y: 47.5, bold: false })
    const centred = layoutTableCells({ ...t, textAlign: "center" }, measure)[0]!
    expect(centred.x).toBe(180)
    const right = layoutTableCells({ ...t, textAlign: "right" }, measure)[0]!
    expect(right.x).toBe(232)
  })

  it("wraps per cell width and marks the header row bold", () => {
    // cell inner width 104px = 10 chars at 10px/char
    const t = setCellText(setCellText(base(), 0, 0, "aaaa bbbb cccc"), 2, 0, "x")
    const lines = layoutTableCells(t, measure)
    const first = lines.filter((l) => l.row === 0)
    expect(first.map((l) => l.text)).toEqual(["aaaa bbbb", "cccc"])
    expect(first.every((l) => l.bold)).toBe(true)
    expect(lines.find((l) => l.row === 2)!.bold).toBe(false)
  })

  it("skips empty cells", () => {
    expect(layoutTableCells(base(), measure)).toEqual([])
  })
})

describe("table canvas drawing", () => {
  it("draws one fillText per cell line, header in bold", () => {
    const t = setCellText(setCellText(base(), 0, 0, "Head"), 1, 2, "body")
    const ctx = draw(t)
    const texts = callsOf(ctx, "fillText").map((c) => c.args[0])
    expect(texts).toEqual(["Head", "body"])
    const fonts = ctx.__calls.filter((c) => c.method === "set:font").map((c) => c.args[0] as string)
    expect(fonts.some((f) => f.includes("bold"))).toBe(true)
  })

  it("skips only the cell being edited", () => {
    const t = setCellText(setCellText(base(), 0, 0, "Head"), 1, 2, "body")
    const ctx = draw(t, { row: 0, col: 0 })
    expect(callsOf(ctx, "fillText").map((c) => c.args[0])).toEqual(["body"])
  })

  it("honours the shared shadow path", () => {
    const ctx = draw(base({ shadow: { color: "#00000059", blur: 6, offsetX: 6, offsetY: 6 } }))
    expect(ctx.__calls.some((c) => c.method === "set:shadowBlur" && c.args[0] === 6)).toBe(true)
  })
})

describe("table SVG export", () => {
  it("contains the cell text and the grid", () => {
    const t = setCellText(setCellText(base(), 0, 1, "Name"), 2, 2, "한글")
    const svg = renderToSVG(new Scene([t]), {
      measure: (s) => ({ width: s.length * 10, height: 20 }),
    })
    expect(svg).toContain(">Name</text>")
    expect(svg).toContain(">한글</text>")
    expect(svg).toContain('font-weight="bold"')
    // header tint + border + 4 grid lines = 6 rough groups of <path>
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(6)
  })

  it("renders without a measurer (no wrapping)", () => {
    const t = setCellText(base(), 0, 0, "solo")
    expect(renderToSVG(new Scene([t]))).toContain("solo")
  })
})
