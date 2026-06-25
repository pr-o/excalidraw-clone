import { describe, expect, it } from "vitest"
import { linearPatch, pointsPatch } from "../src/tools/linear"

describe("pointsPatch", () => {
  it("re-bases a 3-point path to a fresh bounding box", () => {
    const patch = pointsPatch([
      { x: 10, y: 20 },
      { x: 50, y: 5 },
      { x: 30, y: 60 },
    ])
    expect(patch.x).toBe(10)
    expect(patch.y).toBe(5)
    expect(patch.width).toBe(40) // 50 - 10
    expect(patch.height).toBe(55) // 60 - 5
    expect(patch.points).toEqual([
      { x: 0, y: 15 },
      { x: 40, y: 0 },
      { x: 20, y: 55 },
    ])
  })

  it("round-trips: abs -> patch -> abs reproduces the input", () => {
    const abs = [
      { x: 100, y: 200 },
      { x: 140, y: 260 },
    ]
    const patch = pointsPatch(abs)
    const back = patch.points.map((p) => ({ x: patch.x + p.x, y: patch.y + p.y }))
    expect(back).toEqual(abs)
  })

  it("linearPatch matches pointsPatch of two points", () => {
    const a = { x: 30, y: 70 }
    const b = { x: 10, y: 10 }
    expect(linearPatch(a, b)).toEqual(pointsPatch([a, b]))
  })
})
