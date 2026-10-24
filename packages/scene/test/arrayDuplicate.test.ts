import { describe, expect, it } from "vitest"
import { ARRAY_DUPLICATE_MAX_ELEMENTS, arrayDuplicate } from "../src/arrayDuplicate"
import { newArrow, newLabelFor, newRectangle } from "../src/factories"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "../src/types"

const rect = (x: number, y: number): ExcalidrawElement =>
  newRectangle({ x, y, width: 30, height: 10 })

describe("arrayDuplicate", () => {
  it("lays out cols-1 copies in a row spaced by bbox width + gapX", () => {
    const a = rect(10, 20)
    const copies = arrayDuplicate([a], [a.id], { rows: 1, cols: 3, gapX: 5, gapY: 0 })
    expect(copies.map((c) => [c.x, c.y])).toEqual([
      [45, 20],
      [80, 20],
    ])
    expect(new Set(copies.map((c) => c.id)).size).toBe(2)
    expect(copies.some((c) => c.id === a.id)).toBe(false)
  })

  it("fills a rows x cols grid (original at [0,0]) spaced by bbox height + gapY", () => {
    const a = rect(0, 0)
    const copies = arrayDuplicate([a], [a.id], { rows: 2, cols: 2, gapX: 10, gapY: 20 })
    expect(copies.map((c) => [c.x, c.y])).toEqual([
      [40, 0],
      [0, 30],
      [40, 30],
    ])
  })

  it("uses the bbox of the whole selection, keeping relative positions", () => {
    const a = rect(0, 0)
    const b = rect(50, 0) // selection bbox width = 80
    const copies = arrayDuplicate([a, b], [a.id, b.id], { rows: 1, cols: 2, gapX: 0, gapY: 0 })
    expect(copies.map((c) => c.x)).toEqual([80, 130])
  })

  it("gives each copy its own fresh group and rewires labels and internal arrow bindings", () => {
    const a = { ...rect(0, 0), groupIds: ["g"] }
    const b = { ...rect(100, 0), groupIds: ["g"] }
    const label = { ...newLabelFor(a), text: "hi" }
    const aLabelled = { ...a, boundElements: [{ id: label.id, type: "text" as const }] }
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: 30, y: 5 }),
      groupIds: ["g"],
      startBinding: { elementId: a.id, focus: 0, gap: 4 },
      endBinding: { elementId: b.id, focus: 0, gap: 4 },
    }
    const elements = [aLabelled, label, b, arrow]
    const copies = arrayDuplicate(elements, [a.id, b.id, arrow.id], {
      rows: 1,
      cols: 3,
      gapX: 10,
      gapY: 10,
    })
    expect(copies).toHaveLength(8) // label carried along via the copy closure
    const groups = new Set(copies.flatMap((c) => c.groupIds))
    expect(groups.size).toBe(2)
    expect(groups.has("g")).toBe(false)
    const arrows = copies.filter((c): c is ExcalidrawArrowElement => c.type === "arrow")
    for (const ar of arrows) {
      const start = copies.find((c) => c.id === ar.startBinding?.elementId)!
      expect(start.groupIds).toEqual(ar.groupIds)
      const lbl = copies.find((c) => c.type === "text" && c.containerId === start.id)
      expect(lbl).toBeDefined()
    }
  })

  it("clamps rows/cols to 1..20 and returns [] for a 1x1 grid", () => {
    const a = rect(0, 0)
    expect(arrayDuplicate([a], [a.id], { rows: 1, cols: 1, gapX: 0, gapY: 0 })).toEqual([])
    expect(arrayDuplicate([a], [a.id], { rows: 0, cols: -4, gapX: 0, gapY: 0 })).toEqual([])
    expect(arrayDuplicate([a], [a.id], { rows: 1, cols: 99, gapX: 0, gapY: 0 })).toHaveLength(19)
    expect(arrayDuplicate([a], [a.id], { rows: 2.7, cols: 1, gapX: 0, gapY: 0 })).toHaveLength(1)
  })

  it("caps the total number of new elements", () => {
    const many = Array.from({ length: 50 }, (_, i) => rect(i * 40, 0))
    const copies = arrayDuplicate(
      many,
      many.map((e) => e.id),
      { rows: 20, cols: 20, gapX: 0, gapY: 0 },
    )
    expect(copies.length).toBeLessThanOrEqual(ARRAY_DUPLICATE_MAX_ELEMENTS)
    expect(copies.length % 50).toBe(0) // whole cells only
  })

  it("skips locked elements and treats non-finite gaps as 0", () => {
    const a = rect(0, 0)
    const locked = { ...rect(100, 0), locked: true }
    const copies = arrayDuplicate([a, locked], [a.id, locked.id], {
      rows: 1,
      cols: 2,
      gapX: Number.NaN,
      gapY: 0,
    })
    expect(copies).toHaveLength(1)
    expect(copies[0]!.x).toBe(30)
  })

  it("returns [] for an empty or all-locked selection and does not mutate input", () => {
    const a = { ...rect(0, 0), locked: true }
    expect(arrayDuplicate([a], [], { rows: 2, cols: 2, gapX: 0, gapY: 0 })).toEqual([])
    expect(arrayDuplicate([a], [a.id], { rows: 2, cols: 2, gapX: 0, gapY: 0 })).toEqual([])
    expect(a.x).toBe(0)
  })
})
