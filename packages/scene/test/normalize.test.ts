import { describe, expect, it } from "vitest"
import { normalizeToOrigin } from "../src/normalize"
import type { ExcalidrawElement } from "../src/types"

function rect(id: string, x: number, y: number, w: number, h: number): ExcalidrawElement {
  return { id, type: "rectangle", x, y, width: w, height: h } as unknown as ExcalidrawElement
}

describe("normalizeToOrigin", () => {
  it("translates a single element to (0,0)", () => {
    const [out] = normalizeToOrigin([rect("a", 50, 30, 10, 10)])
    expect(out!.x).toBe(0)
    expect(out!.y).toBe(0)
  })

  it("preserves relative positions across multiple elements", () => {
    const out = normalizeToOrigin([rect("a", 100, 50, 10, 10), rect("b", 130, 80, 10, 10)])
    expect(out[0]!.x).toBe(0)
    expect(out[0]!.y).toBe(0)
    expect(out[1]!.x).toBe(30)
    expect(out[1]!.y).toBe(30)
  })

  it("handles negative coordinates", () => {
    const out = normalizeToOrigin([rect("a", -20, -10, 10, 10), rect("b", 0, 0, 10, 10)])
    expect(out[0]!.x).toBe(0)
    expect(out[0]!.y).toBe(0)
    expect(out[1]!.x).toBe(20)
    expect(out[1]!.y).toBe(10)
  })

  it("returns a new array without mutating the input", () => {
    const input = [rect("a", 50, 30, 10, 10)]
    const before = input[0]!.x
    normalizeToOrigin(input)
    expect(input[0]!.x).toBe(before)
  })

  it("returns [] for an empty input", () => {
    expect(normalizeToOrigin([])).toEqual([])
  })
})
