import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { alignElements, distributeElements } from "../src/arrange"

const rect = (x: number, y: number, w: number, h: number) => ({
  ...newRectangle({ x, y, width: w, height: h }),
})

describe("alignElements", () => {
  const a = rect(0, 0, 10, 10) // bounds x 0..10,  y 0..10
  const b = rect(100, 50, 20, 20) // bounds x 100..120, y 50..70

  const patchFor = (edge: Parameters<typeof alignElements>[1], id: string) =>
    alignElements([a, b], edge).find((p) => p.id === id)!

  it("returns [] for fewer than 2 elements", () => {
    expect(alignElements([a], "left")).toEqual([])
    expect(alignElements([], "left")).toEqual([])
  })

  it("left aligns every element's left edge to the group min-x", () => {
    expect(patchFor("left", a.id).x).toBe(0)
    expect(patchFor("left", b.id).x).toBe(0)
  })

  it("right aligns every element's right edge to the group max-x", () => {
    expect(patchFor("right", a.id).x).toBe(110) // 120 - 10
    expect(patchFor("right", b.id).x).toBe(100) // 120 - 20
  })

  it("centerX aligns every element's center to the group center-x", () => {
    // group center-x = (0 + 120) / 2 = 60
    expect(patchFor("centerX", a.id).x).toBe(55) // 60 - 5
    expect(patchFor("centerX", b.id).x).toBe(50) // 60 - 10
  })

  it("top aligns every element's top edge to the group min-y", () => {
    expect(patchFor("top", a.id).y).toBe(0)
    expect(patchFor("top", b.id).y).toBe(0)
  })
})

describe("distributeElements", () => {
  it("returns [] for fewer than 3 elements", () => {
    expect(distributeElements([rect(0, 0, 10, 10), rect(50, 0, 10, 10)], "horizontal")).toEqual([])
  })

  it("gives equal edge-to-edge gaps horizontally, moving only the interior", () => {
    const first = rect(0, 0, 10, 10) // right edge 10
    const mid = rect(30, 0, 10, 10)
    const last = rect(100, 0, 10, 10) // left edge 100
    const patches = distributeElements([first, mid, last], "horizontal")
    // gap = (100 - 10 - 10) / 2 = 40; mid left edge -> 10 + 40 = 50
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe(mid.id)
    expect(patches[0]!.x).toBe(50)
  })
})
