import { describe, expect, it } from "vitest"
import { newArrow, newNote, newRectangle } from "../src/factories"
import { cloneElementsWithNewIds } from "../src/clone"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "../src/types"

describe("cloneElementsWithNewIds", () => {
  it("gives every element a fresh id distinct from all originals", () => {
    const els = [
      newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      newRectangle({ x: 20, y: 0, width: 10, height: 10 }),
    ]
    const oldIds = new Set(els.map((e) => e.id))
    const cloned = cloneElementsWithNewIds(els)
    expect(cloned).toHaveLength(2)
    for (const c of cloned) {
      expect(oldIds.has(c.id)).toBe(false)
    }
    expect(new Set(cloned.map((c) => c.id)).size).toBe(2)
  })

  it("rewrites arrow start/end bindings to the cloned node ids", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 100, y: 0, width: 10, height: 10 })
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      startBinding: { elementId: a.id, focus: 0, gap: 4 },
      endBinding: { elementId: b.id, focus: 0, gap: 4 },
    }
    const cloned = cloneElementsWithNewIds([a, b, arrow])
    const [ca, cb, carrow] = cloned as [
      ExcalidrawElement,
      ExcalidrawElement,
      ExcalidrawArrowElement,
    ]
    expect(carrow.startBinding?.elementId).toBe(ca.id)
    expect(carrow.endBinding?.elementId).toBe(cb.id)
    expect(carrow.startBinding?.elementId).not.toBe(a.id)
  })

  it("keeps a note's container<->text references mutually consistent", () => {
    const note = newNote({ x: 0, y: 0, width: 80, height: 80 })
    const cloned = cloneElementsWithNewIds([note.container, note.text])
    const container = cloned.find((e) => e.type === "rectangle")!
    const text = cloned.find((e) => e.type === "text")!
    expect(text.type === "text" ? text.containerId : null).toBe(container.id)
    expect(container.boundElements?.some((b) => b.id === text.id)).toBe(true)
  })

  it("leaves an unmapped external reference unchanged", () => {
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      startBinding: { elementId: "external-id-not-in-set", focus: 0, gap: 4 },
      endBinding: null,
    }
    const [carrow] = cloneElementsWithNewIds([arrow]) as [ExcalidrawArrowElement]
    expect(carrow.startBinding?.elementId).toBe("external-id-not-in-set")
  })

  it("remaps groupIds to a fresh id shared within the clone set", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    const b = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    const [ca, cb] = cloneElementsWithNewIds([a, b]) as [ExcalidrawElement, ExcalidrawElement]
    expect(ca.groupIds).toHaveLength(1)
    expect(ca.groupIds[0]).toBe(cb.groupIds[0])
    expect(ca.groupIds[0]).not.toBe("g1")
  })

  it("gives distinct clone sets distinct group ids", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    const [first] = cloneElementsWithNewIds([a]) as [ExcalidrawElement]
    const [second] = cloneElementsWithNewIds([a]) as [ExcalidrawElement]
    expect(first.groupIds[0]).not.toBe(second.groupIds[0])
  })

  it("leaves empty groupIds empty", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const [ca] = cloneElementsWithNewIds([a]) as [ExcalidrawElement]
    expect(ca.groupIds).toEqual([])
  })
})
