import { describe, expect, it } from "vitest"
import { newFreedraw, newLabelFor, newLine, newRectangle, newText } from "../src/factories"
import { resizeElements } from "../src/resize-group"
import type { ExcalidrawElement } from "../src/types"

interface HandleCase {
  handle: string
  newBounds: { x: number; y: number; width: number; height: number }
  expected: { x: number; y: number; width: number; height: number }
}

const HANDLE_CASES: HandleCase[] = [
  {
    handle: "nw",
    newBounds: { x: -10, y: -20, width: 120, height: 130 },
    expected: { x: 14, y: 19, width: 12, height: 19.5 },
  },
  {
    handle: "n",
    newBounds: { x: 0, y: -20, width: 100, height: 120 },
    expected: { x: 20, y: 16, width: 10, height: 18 },
  },
  {
    handle: "ne",
    newBounds: { x: 0, y: -10, width: 150, height: 110 },
    expected: { x: 30, y: 23, width: 15, height: 16.5 },
  },
  {
    handle: "e",
    newBounds: { x: 0, y: 0, width: 150, height: 100 },
    expected: { x: 30, y: 30, width: 15, height: 15 },
  },
  {
    handle: "se",
    newBounds: { x: 0, y: 0, width: 150, height: 130 },
    expected: { x: 30, y: 39, width: 15, height: 19.5 },
  },
  {
    handle: "s",
    newBounds: { x: 0, y: 0, width: 100, height: 130 },
    expected: { x: 20, y: 39, width: 10, height: 19.5 },
  },
  {
    handle: "sw",
    newBounds: { x: -30, y: 0, width: 130, height: 100 },
    expected: { x: -4, y: 30, width: 13, height: 15 },
  },
  {
    handle: "w",
    newBounds: { x: -20, y: 0, width: 120, height: 100 },
    expected: { x: 4, y: 30, width: 12, height: 15 },
  },
]

describe("resizeElements — rectangle-like scaling from each handle direction", () => {
  const origin = { x: 0, y: 0, width: 100, height: 100 }

  it.each(HANDLE_CASES)(
    "$handle handle scales position and size relative to the origin box",
    ({ newBounds, expected }) => {
      const el = newRectangle({ x: 20, y: 30, width: 10, height: 15 })
      const [out] = resizeElements([el], [el.id], origin, newBounds)
      expect(out!.x).toBeCloseTo(expected.x)
      expect(out!.y).toBeCloseTo(expected.y)
      expect(out!.width).toBeCloseTo(expected.width)
      expect(out!.height).toBeCloseTo(expected.height)
      expect(out!.angle).toBe(el.angle)
    },
  )
})

describe("resizeElements — line/arrow/freedraw points+bbox invariant", () => {
  it("recomputes width/height from the scaled points' bbox, ignoring a stale stored width/height", () => {
    const el = {
      ...newLine({ x: 0, y: 0, width: 999, height: 999 }),
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
        { x: 100, y: 10 },
      ],
    }
    const originBounds = { x: 0, y: 0, width: 200, height: 100 }
    const newBounds = { x: 0, y: 0, width: 400, height: 150 } // sx=2, sy=1.5
    const [out] = resizeElements([el], [el.id], originBounds, newBounds)
    expect((out as typeof el).points).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 30 },
      { x: 200, y: 15 },
    ])
    expect(out!.width).toBe(200) // bbox of scaled points (0..200), NOT the stale 999*2
    expect(out!.height).toBe(30) // bbox of scaled points (0..30), NOT the stale 999*1.5
  })

  it("scales position the same way as rectangle-like elements", () => {
    const el = {
      ...newLine({ x: 10, y: 5, width: 50, height: 20 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 20 },
      ],
    }
    const originBounds = { x: 0, y: 0, width: 200, height: 100 }
    const newBounds = { x: 0, y: 0, width: 400, height: 150 }
    const [out] = resizeElements([el], [el.id], originBounds, newBounds)
    expect(out!.x).toBe(20) // 0 + (10-0)*2
    expect(out!.y).toBe(7.5) // 0 + (5-0)*1.5
  })

  it("freedraw: same points+bbox recompute; other fields (pressures) untouched", () => {
    const el = {
      ...newFreedraw({ x: 0, y: 0, width: 10, height: 10 }),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      pressures: [0.5, 0.8],
    }
    const originBounds = { x: 0, y: 0, width: 100, height: 100 }
    const newBounds = { x: 0, y: 0, width: 200, height: 50 }
    const [out] = resizeElements([el], [el.id], originBounds, newBounds)
    expect((out as typeof el).points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 5 },
    ])
    expect(out!.width).toBe(20)
    expect(out!.height).toBe(5)
    expect((out as typeof el).pressures).toEqual([0.5, 0.8])
  })

  it("leaves startBinding/endBinding untouched", () => {
    const el = {
      ...newLine({ x: 0, y: 0, width: 50, height: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      startBinding: { elementId: "s", focus: 0.3, gap: 4 },
      endBinding: { elementId: "e", focus: -0.1, gap: 4 },
    }
    const originBounds = { x: 0, y: 0, width: 100, height: 100 }
    const newBounds = { x: 0, y: 0, width: 200, height: 100 }
    const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
    expect(out.startBinding).toEqual(el.startBinding)
    expect(out.endBinding).toEqual(el.endBinding)
  })
})

describe("resizeElements — text fontSize scaling", () => {
  it("scales fontSize by the y-axis factor", () => {
    const el = newText({ x: 0, y: 0, width: 40, height: 20, fontSize: 20 })
    const originBounds = { x: 0, y: 0, width: 100, height: 100 }
    const newBounds = { x: 0, y: 0, width: 100, height: 200 } // sy = 2
    const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
    expect(out.fontSize).toBe(40)
  })

  it("clamps fontSize to a minimum of 4 when the scale would shrink it below that", () => {
    const el = newText({ x: 0, y: 0, width: 40, height: 20, fontSize: 20 })
    const originBounds = { x: 0, y: 0, width: 100, height: 100 }
    const newBounds = { x: 0, y: 0, width: 100, height: 10 } // sy = 0.1 -> raw fontSize 2
    const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
    expect(out.fontSize).toBe(4)
  })
})

describe("resizeElements — bound-text label exclusion", () => {
  const labelledRect = (box: { x: number; y: number; width: number; height: number }) => {
    const container = newRectangle(box)
    const label = newLabelFor(container)
    return {
      container: { ...container, boundElements: [{ id: label.id, type: "text" as const }] },
      label,
    }
  }

  it("excludes a passenger label (its container is also selected) from the result", () => {
    const { container, label } = labelledRect({ x: 0, y: 0, width: 100, height: 100 })
    const originBounds = { x: 0, y: 0, width: 100, height: 100 }
    const newBounds = { x: 0, y: 0, width: 200, height: 200 }
    const out = resizeElements(
      [container, label],
      [container.id, label.id],
      originBounds,
      newBounds,
    )
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.has(label.id)).toBe(false)
    expect(byId.has(container.id)).toBe(true)
  })

  it("still transforms a bound label when it is selected without its container", () => {
    const { label } = labelledRect({ x: 0, y: 0, width: 100, height: 100 })
    const originBounds = { x: 0, y: 0, width: 100, height: 100 }
    const newBounds = { x: 0, y: 0, width: 200, height: 100 }
    const [out] = resizeElements([label], [label.id], originBounds, newBounds) as [typeof label]
    expect(out.fontSize).toBe(label.fontSize) // sy = 1, unchanged, but the transform DID run
    expect(out.width).toBe(label.width * 2)
  })
})

describe("resizeElements — locked/deleted filtering", () => {
  it("excludes a locked element from the result", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 })
    const locked = { ...newRectangle({ x: 50, y: 0, width: 20, height: 20 }), locked: true }
    const originBounds = { x: 0, y: 0, width: 70, height: 20 }
    const newBounds = { x: 0, y: 0, width: 140, height: 40 }
    const out = resizeElements([a, locked], [a.id, locked.id], originBounds, newBounds)
    expect(out.map((e) => e.id)).toEqual([a.id])
  })

  it("returns [] when the only selected id is missing or deleted", () => {
    const deleted = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
    const box = { x: 0, y: 0, width: 10, height: 10 }
    expect(resizeElements([deleted], [deleted.id], box, box)).toEqual([])
    expect(resizeElements([deleted], ["ghost"], box, box)).toEqual([])
  })
})

describe("resizeElements — zero-width/zero-height origin-axis guard", () => {
  it("forces that axis's scale to 1 instead of dividing by zero", () => {
    const el: ExcalidrawElement = {
      ...newFreedraw({ x: 50, y: 10, width: 0, height: 0 }),
      points: [{ x: 0, y: 0 }],
    }
    const originBounds = { x: 50, y: 10, width: 0, height: 0 }
    const newBounds = { x: 80, y: 40, width: 60, height: 90 }
    const [out] = resizeElements([el], [el.id], originBounds, newBounds) as [typeof el]
    expect(out.x).toBe(80) // 80 + (50-50)*1
    expect(out.y).toBe(40) // 40 + (10-10)*1
    expect(out.points).toEqual([{ x: 0, y: 0 }])
    expect(out.width).toBe(0)
    expect(out.height).toBe(0)
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.y)).toBe(true)
    expect(Number.isFinite(out.width)).toBe(true)
    expect(Number.isFinite(out.height)).toBe(true)
  })
})
