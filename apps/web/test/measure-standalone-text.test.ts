import { newText, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { measureStandaloneText, refitFreeText } from "../src/driver/measureStandaloneText"
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

  it("wraps fixed-width text at its width, keeping the width", () => {
    const el = {
      ...newText({ x: 0, y: 0, text: "hello world", fontSize: 20 }),
      autoResize: false,
      width: 60,
    }
    // "hello" = 50 fits in 60, "hello world" = 110 does not → 2 lines × 25
    expect(measureStandaloneText(el)).toEqual({ width: 60, height: 50 })
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

describe("refitFreeText — after web fonts load", () => {
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
  })
  afterEach(() => getContextSpy.mockRestore())

  it("re-fits stale auto-sized free text without adding an undo step", () => {
    const stale = { ...newText({ x: 0, y: 0, text: "abcd", fontSize: 20 }), width: 99, height: 7 }
    const fixed = {
      ...newText({ x: 0, y: 50, text: "abcd", fontSize: 20 }),
      autoResize: false,
      width: 99,
      height: 7,
    }
    const scene = new Scene([stale, fixed])
    const historyBefore = scene.getHistory().length
    refitFreeText(scene)
    const [a, b] = scene.getElements()
    expect({ width: a!.width, height: a!.height }).toEqual({ width: 40, height: 25 })
    // Fixed-width text keeps the user's width.
    expect(b!.width).toBe(99)
    expect(scene.getHistory().length).toBe(historyBefore)
  })

  it("leaves an already-fitted scene untouched", () => {
    const scene = new Scene([newText({ x: 0, y: 0, text: "abcd", fontSize: 20 })])
    refitFreeText(scene)
    const changed = vi.fn()
    scene.subscribe(changed)
    refitFreeText(scene)
    expect(changed).not.toHaveBeenCalled()
  })
})
