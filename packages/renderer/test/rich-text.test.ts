import { newText, Scene, type TextSpan } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { renderToSVG } from "../src/svg"
import { drawText } from "../src/shapes/text"
import { layoutLabel, measureText, wrapLines } from "../src/text-metrics"
import { createMockCanvas } from "../src/test-utils/mock-canvas"

const b = (start: number, end: number): TextSpan => ({ start, end, bold: true })
// mock canvas: 10px per char
const m = (s: string): number => s.length * 10

const drawn = (el: Parameters<typeof drawText>[1], opts?: Parameters<typeof drawText>[3]) => {
  const { ctx } = createMockCanvas()
  const calls: { text: string; font: unknown; x: unknown }[] = []
  const orig = ctx.fillText as (...a: unknown[]) => void
  ctx.fillText = (...a: unknown[]) => {
    calls.push({ text: String(a[0]), font: ctx.__props.font, x: a[1] })
    orig(...a)
  }
  drawText(ctx as unknown as CanvasRenderingContext2D, el, undefined, opts)
  return calls
}

describe("bullet hanging indent in the shared layout", () => {
  it("indents wrapped continuation lines of a bullet by the bullet width", () => {
    const out = layoutLabel("• aa bb cc", { width: 60, height: 200 }, 20, 1.25, m)
    // "• aa" = 40, "• aa bb" = 70 > 60 → wrap; continuation lines carry a 20px indent
    expect(out.wrapped[0]!.indent).toBe(0)
    expect(out.wrapped[1]!.indent).toBe(20)
    // continuation width budget is 60 - 20 = 40: "bb cc" (50) does not fit
    expect(out.lines).toEqual(["• aa", "bb", "cc"])
  })
  it("leaves plain lines untouched", () => {
    expect(wrapLines("aa bb cc", 50, m)).toEqual(["aa bb", "cc"])
  })
  it("draws the hang for left-aligned text", () => {
    const t = { ...newText({ x: 0, y: 0, text: "• aa bb cc" }), autoResize: false, width: 60 }
    expect(drawn(t).map((c) => c.x)).toEqual([0, 20, 20])
  })
})

describe("rich drawText", () => {
  it("draws one run per style with its own font", () => {
    const t = { ...newText({ x: 0, y: 0, text: "hello world" }), spans: [b(6, 11)] }
    const calls = drawn(t)
    expect(calls.map((c) => c.text)).toEqual(["hello ", "world"])
    expect(String(calls[0]!.font)).toMatch(/^normal normal 20px /)
    expect(String(calls[1]!.font)).toContain("bold")
    // second run starts after the first run's measured width (6 chars * 10)
    expect(calls[1]!.x).toBe(60)
  })
  it("italic and bold italic fonts", () => {
    const t = {
      ...newText({ x: 0, y: 0, text: "ab" }),
      spans: [
        { start: 0, end: 1, italic: true as const },
        { start: 1, end: 2, bold: true as const, italic: true as const },
      ],
    }
    const fonts = drawn(t).map((c) => String(c.font))
    expect(fonts[0]).toMatch(/^italic normal /)
    expect(fonts[1]).toMatch(/^italic bold /)
  })
  it("plain text keeps the single-fillText fast path", () => {
    const t = newText({ x: 0, y: 0, text: "hello world" })
    expect(drawn(t).map((c) => c.text)).toEqual(["hello world"])
  })
  it("wraps fixed-width rich text and keeps runs aligned across the break", () => {
    const t = {
      ...newText({ x: 0, y: 0, text: "aa bb cc" }),
      autoResize: false,
      width: 50,
      spans: [b(3, 8)],
    }
    expect(drawn(t).map((c) => c.text)).toEqual(["aa ", "bb", "cc"])
  })
})

describe("measureText with spans", () => {
  it("measures run by run", () => {
    const { ctx } = createMockCanvas()
    const size = measureText(
      ctx as unknown as CanvasRenderingContext2D,
      "ab\ncde",
      20,
      1,
      1.25,
      "normal",
      "normal",
      undefined,
      [b(3, 6)],
    )
    expect(size).toEqual({ width: 30, height: 50 })
  })
})

describe("SVG tspans", () => {
  const svgFor = (el: ReturnType<typeof newText>) =>
    renderToSVG(new Scene([el]), {
      measure: (t, fs, _f, lh) => ({ width: t.length * 10, height: fs * lh }),
    })
  it("emits a bold tspan per bold run and preserves space", () => {
    const svg = svgFor({ ...newText({ x: 0, y: 0, text: "hello world" }), spans: [b(6, 11)] })
    expect(svg).toContain('<tspan font-weight="bold">world</tspan>')
    expect(svg).toContain('xml:space="preserve"')
  })
  it("emits italic and plain text without span wrappers", () => {
    const svg = svgFor({
      ...newText({ x: 0, y: 0, text: "ab" }),
      spans: [{ start: 1, end: 2, italic: true }],
    })
    expect(svg).toContain('<tspan font-style="italic">b</tspan>')
  })
  it("plain text output has no nested tspans", () => {
    expect(svgFor(newText({ x: 0, y: 0, text: "hi" }))).not.toContain('font-weight="bold"><')
  })
})
