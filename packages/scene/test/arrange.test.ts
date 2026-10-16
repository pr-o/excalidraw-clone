import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { alignElements, distributeElements, tidyElements } from "../src/arrange"

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

describe("tidyElements", () => {
  const apply = (els: ReturnType<typeof rect>[], gap?: number) => {
    const patches = tidyElements(els, gap)
    return els.map((el) => {
      const p = patches.find((q) => q.id === el.id)
      return p ? { ...el, x: p.x, y: p.y } : el
    })
  }

  it("returns [] for fewer than 2 elements", () => {
    expect(tidyElements([rect(0, 0, 10, 10)])).toEqual([])
    expect(tidyElements([])).toEqual([])
  })

  it("lays out a single row left-to-right with the gap, vertically centered", () => {
    const a = rect(10, 20, 40, 40) // center-y 40
    const b = rect(200, 30, 20, 20) // center-y 40, within a's 20..60
    const c = rect(90, 30, 30, 10) // center-y 35, seeds the row
    const [na, nb, nc] = apply([a, b, c])
    expect(na).toMatchObject({ x: 10, y: 20 })
    expect(nc).toMatchObject({ x: 74, y: 35 }) // 10+40+24; centered in row 20..60
    expect(nb).toMatchObject({ x: 128, y: 30 }) // 74+30+24
  })

  it("stacks two rows with the gap between them, from the original top-left", () => {
    const a = rect(50, 10, 20, 20) // row 1
    const b = rect(0, 10, 10, 30) // row 1 (center-y 25 within 10..30)
    const c = rect(300, 200, 40, 10) // row 2
    const [na, nb, nc] = apply([a, b, c], 10)
    // origin (0, 10); row 1 height = 30
    expect(nb).toMatchObject({ x: 0, y: 10 })
    expect(na).toMatchObject({ x: 20, y: 15 })
    expect(nc).toMatchObject({ x: 0, y: 50 }) // 10 + 30 + 10
  })

  it("leaves no overlaps after tidying an overlapping pile", () => {
    const els = [
      rect(0, 0, 50, 50),
      rect(10, 10, 50, 50),
      rect(20, 5, 30, 30),
      rect(5, 100, 40, 40),
    ]
    const out = apply(els)
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const p = out[i]!
        const q = out[j]!
        const overlap =
          p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height
        expect(overlap).toBe(false)
      }
    }
  })
})
