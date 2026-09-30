import { newText } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { measureStandaloneText } from "../src/driver/measureStandaloneText"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"

describe("measureStandaloneText — with a 2D context", () => {
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
  })
  afterEach(() => getContextSpy.mockRestore())

  it("measures width from the widest line and height from line count", () => {
    const el = newText({ x: 0, y: 0, text: "ab\nabcd", fontSize: 20 })
    // widest line "abcd": 4 × 20 × 0.5 = 40; height: 2 lines × 20 × 1.25 = 50
    expect(measureStandaloneText(el)).toEqual({ width: 40, height: 50 })
  })

  it("larger fontSize produces a larger box", () => {
    const small = measureStandaloneText(newText({ x: 0, y: 0, text: "hello", fontSize: 16 }))!
    const large = measureStandaloneText(newText({ x: 0, y: 0, text: "hello", fontSize: 36 }))!
    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })

  it("bold is wider than normal", () => {
    const normal = measureStandaloneText(newText({ x: 0, y: 0, text: "hello" }))!
    const bold = measureStandaloneText(newText({ x: 0, y: 0, text: "hello", fontWeight: "bold" }))!
    expect(bold.width).toBeGreaterThan(normal.width)
  })

  it("treats a legacy element without fontWeight/fontStyle as normal", () => {
    const { fontWeight: _w, fontStyle: _s, ...legacy } = newText({ x: 0, y: 0, text: "hello" })
    const normal = measureStandaloneText(newText({ x: 0, y: 0, text: "hello" }))
    expect(measureStandaloneText(legacy)).toEqual(normal)
  })
})

describe("measureStandaloneText — without a 2D context", () => {
  it("returns undefined when getContext yields null", () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null)
    expect(measureStandaloneText(newText({ x: 0, y: 0, text: "hello" }))).toBeUndefined()
    spy.mockRestore()
  })
})
