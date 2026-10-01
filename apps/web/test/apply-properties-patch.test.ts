import {
  newLabelFor,
  newRectangle,
  newText,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type MockInstance,
  vi,
} from "vitest"
import { applyPropertiesPatch, type Measurer } from "../src/driver/applyPropertiesPatch"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"

/** Deterministic fake: width = chars × fontSize × 0.5 (× 1.2 if bold);
 *  height = lines × fontSize × lineHeight. Records every input it sees. */
const fakeMeasure = (): Mock<Measurer> =>
  vi.fn<Measurer>((input) => {
    const lines = input.text.split("\n")
    const widest = Math.max(...lines.map((l) => l.length))
    const bold = (input.fontWeight ?? "normal") === "bold" ? 1.2 : 1
    return {
      width: widest * input.fontSize * 0.5 * bold,
      height: lines.length * input.fontSize * input.lineHeight,
    }
  })

/** A standalone text element carrying a deliberately stale 1×1 box. */
const staleText = (overrides: Partial<ExcalidrawTextElement> = {}): ExcalidrawTextElement => ({
  ...newText({ x: 10, y: 20, text: "hello" }),
  width: 1,
  height: 1,
  ...overrides,
})

describe("applyPropertiesPatch — standalone text + font keys", () => {
  it.each([
    [{ fontSize: 36 }],
    [{ fontFamily: 3 as const }],
    [{ fontWeight: "bold" as const }],
    [{ fontStyle: "italic" as const }],
  ])("re-measures width/height for patch %o", (patch) => {
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(staleText(), patch, measure) as ExcalidrawTextElement
    expect(measure).toHaveBeenCalledTimes(1)
    expect(out.width).not.toBe(1)
    expect(out.height).not.toBe(1)
    for (const [k, v] of Object.entries(patch)) {
      expect(out[k as keyof ExcalidrawTextElement]).toBe(v)
    }
  })

  it("measures the PATCHED element, not the pre-patch one", () => {
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(staleText(), { fontSize: 36 }, measure)
    expect(measure).toHaveBeenCalledWith(expect.objectContaining({ text: "hello", fontSize: 36 }))
    // "hello": 5 × 36 × 0.5 = 90; 1 line × 36 × 1.25 = 45
    expect(out.width).toBe(90)
    expect(out.height).toBe(45)
  })

  it("keeps every other field (id, x, y, text, colors) unchanged", () => {
    const el = staleText({ strokeColor: "#e03131" })
    const out = applyPropertiesPatch(el, { fontWeight: "bold" }, fakeMeasure())
    expect(out).toEqual({ ...el, fontWeight: "bold", width: 60, height: 25 })
  })

  it("multi-line text: width is the widest line, height scales with line count", () => {
    const el = staleText({ text: "a\na much longer line" })
    const out = applyPropertiesPatch(el, { fontSize: 20 }, fakeMeasure())
    // widest line is 18 chars: 18 × 20 × 0.5 = 180; 2 lines × 20 × 1.25 = 50
    expect(out.width).toBe(180)
    expect(out.height).toBe(50)
  })

  it("legacy element without fontWeight/fontStyle is measured as normal and stays legacy", () => {
    const { fontWeight: _w, fontStyle: _s, ...legacy } = staleText()
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(legacy, { fontSize: 20 }, measure)
    expect(out.width).toBe(50) // 5 × 20 × 0.5, no bold factor
    expect("fontWeight" in out).toBe(false)
    expect("fontStyle" in out).toBe(false)
  })

  it("applies the patch but keeps the old size when measurement is unavailable", () => {
    const out = applyPropertiesPatch(staleText(), { fontSize: 36 }, () => undefined)
    expect((out as ExcalidrawTextElement).fontSize).toBe(36)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })
})

describe("applyPropertiesPatch — no re-measure", () => {
  it("does not measure a bound label even for a font patch", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = { ...newLabelFor(rect), width: 7, height: 9 }
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(label, { fontSize: 36 }, measure) as ExcalidrawTextElement
    expect(measure).not.toHaveBeenCalled()
    expect(out.fontSize).toBe(36)
    expect(out.width).toBe(7)
    expect(out.height).toBe(9)
  })

  it("does not measure standalone text for a non-font patch", () => {
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(staleText(), { strokeColor: "#e03131", opacity: 50 }, measure)
    expect(measure).not.toHaveBeenCalled()
    expect(out.strokeColor).toBe("#e03131")
    expect(out.opacity).toBe(50)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })

  it("passes non-text elements through as a plain merge", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 40, height: 30 })
    const measure = fakeMeasure()
    const out = applyPropertiesPatch(rect, { strokeColor: "#e03131" }, measure)
    expect(measure).not.toHaveBeenCalled()
    expect(out).toEqual({ ...rect, strokeColor: "#e03131" })
  })
})

describe("applyPropertiesPatch — multi-selection behavior", () => {
  it("measures each standalone text from its own content", () => {
    const measure = fakeMeasure()
    const shortEl = staleText({ text: "hi" })
    const longEl = staleText({ text: "hello world" })
    const a = applyPropertiesPatch(shortEl, { fontSize: 36 }, measure)
    const b = applyPropertiesPatch(longEl, { fontSize: 36 }, measure)
    expect(a.width).toBe(36) // 2 × 36 × 0.5
    expect(b.width).toBe(198) // 11 × 36 × 0.5
  })
})

describe("applyPropertiesPatch — default measurer (real measureText via stubbed canvas)", () => {
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
  })
  afterEach(() => getContextSpy.mockRestore())

  it("uses measureStandaloneText by default", () => {
    const out = applyPropertiesPatch(staleText(), { fontSize: 28 })
    // font-aware stub: 5 × 28 × 0.5 = 70; renderer height: 1 × 28 × 1.25 = 35
    expect(out.width).toBe(70)
    expect(out.height).toBe(35)
  })

  it("bold makes the default-measured box wider", () => {
    const normal = applyPropertiesPatch(staleText(), { fontWeight: "normal" })
    const bold = applyPropertiesPatch(staleText(), { fontWeight: "bold" })
    expect(bold.width).toBeGreaterThan(normal.width)
  })
})
