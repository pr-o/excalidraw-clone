import { describe, expect, it } from "vitest"
import { layoutLabel } from "../src/text-metrics"

// mirrors the mock canvas: every character is 10px wide
const m = (s: string): number => s.length * 10

describe("layoutLabel", () => {
  it("wraps two words at a narrow width without shrinking", () => {
    const out = layoutLabel("hello world", { width: 60, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["hello", "world"])
    expect(out.scale).toBe(1)
  })

  it("respects manual newlines and only adds breaks", () => {
    const out = layoutLabel("a b\nc", { width: 100, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a b", "c"])
    expect(out.scale).toBe(1)
  })

  it("keeps an over-wide word whole and shrinks by the width bound", () => {
    // "extraordinary" → 130 wide; box 60 → scale 60/130
    const out = layoutLabel("extraordinary", { width: 60, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["extraordinary"])
    expect(out.scale).toBeCloseTo(60 / 130)
  })

  it("preserves empty logical lines", () => {
    const out = layoutLabel("a\n\nb", { width: 100, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a", "", "b"])
  })

  it("returns one line at scale 1 for short text", () => {
    const out = layoutLabel("hi", { width: 84, height: 64 }, 20, 1.25, m)
    expect(out.lines).toEqual(["hi"])
    expect(out.scale).toBe(1)
  })

  it("shrinks by the height bound when wrapping makes the block tall", () => {
    // each word fits alone (10 ≤ 10) but no two together → 4 lines × 25 = 100; box height 50
    const out = layoutLabel("a b c d", { width: 10, height: 50 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a", "b", "c", "d"])
    expect(out.scale).toBe(0.5)
  })

  it("collapses consecutive spaces in wrapped output", () => {
    const out = layoutLabel("a  b", { width: 100, height: 100 }, 20, 1.25, m)
    expect(out.lines).toEqual(["a b"])
  })
})
