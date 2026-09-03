import { describe, expect, it } from "vitest"
import { newArrow, newFreedraw, newParallelogram, newTriangle } from "../src/factories"
import { flipElements } from "../src/flip"

describe("flipElements — single element", () => {
  it("triangle, x-axis: mirror becomes [-1,1], angle negated, box unchanged", () => {
    const t = { ...newTriangle({ x: 10, y: 20, width: 40, height: 30, angle: 0.5 }) }
    const [out] = flipElements([t], [t.id], "x")
    expect(out!.mirror).toEqual([-1, 1])
    expect(out!.angle).toBe(-0.5)
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([10, 20, 40, 30])
  })

  it("triangle, y-axis: mirror becomes [1,-1]", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 40, height: 30 }) }
    const [out] = flipElements([t], [t.id], "y")
    expect(out!.mirror).toEqual([1, -1])
    expect(out!.angle).toBe(0) // -0 normalized
  })

  it("flip∘flip on the same axis restores the original element exactly", () => {
    const t = { ...newTriangle({ x: 5, y: 6, width: 40, height: 30, angle: 0.25 }) }
    const [once] = flipElements([t], [t.id], "x")
    const [twice] = flipElements([once!], [once!.id], "x")
    expect(twice).toEqual(t) // mirror key omitted again
  })

  it("parallelogram x-flip toggles the sign", () => {
    const p = {
      ...newParallelogram({ x: 0, y: 0, width: 40, height: 30 }),
      mirror: [-1, 1] as const,
    }
    const [out] = flipElements([p], [p.id], "x")
    expect(out!.mirror).toBeUndefined()
  })

  it("freedraw: points mirrored across the local centre, bbox unchanged", () => {
    const f = {
      ...newFreedraw({ x: 0, y: 0, width: 100, height: 40 }),
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 10 },
        { x: 100, y: 40 },
      ],
    }
    const [out] = flipElements([f], [f.id], "x")
    expect((out as typeof f).points).toEqual([
      { x: 100, y: 0 },
      { x: 70, y: 10 },
      { x: 0, y: 40 },
    ])
    expect((out as typeof f).mirror).toBeUndefined()
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([0, 0, 100, 40])
  })

  it("arrow with startBinding.focus 0.3 becomes -0.3", () => {
    const a = {
      ...newArrow({ x: 0, y: 0, width: 50, height: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      startBinding: { elementId: "s", focus: 0.3, gap: 4 },
      endBinding: { elementId: "e", focus: -0.1, gap: 4 },
    }
    const [out] = flipElements([a], [a.id], "x") as [typeof a]
    expect(out.startBinding.focus).toBe(-0.3)
    expect(out.endBinding.focus).toBe(0.1)
  })

  it("returns [] when the only selected id is missing or deleted", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
    expect(flipElements([t], [t.id], "x")).toEqual([])
    expect(flipElements([t], ["ghost"], "x")).toEqual([])
  })

  it("returns [] for an empty id list", () => {
    const t = newTriangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(flipElements([t], [], "x")).toEqual([])
  })
})
