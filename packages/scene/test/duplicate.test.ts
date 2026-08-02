import { describe, expect, it } from "vitest"
import { duplicateElements } from "../src/duplicate"
import { newFrame, newLabelFor, newRectangle } from "../src/factories"
import type { ExcalidrawElement } from "../src/types"

describe("duplicateElements", () => {
  it("clones the requested elements with fresh ids, offset by +12/+12", () => {
    const a = newRectangle({ x: 10, y: 20, width: 30, height: 40 })
    const copies = duplicateElements([a], [a.id])
    expect(copies).toHaveLength(1)
    expect(copies[0]!.id).not.toBe(a.id)
    expect(copies[0]!.x).toBe(22)
    expect(copies[0]!.y).toBe(32)
  })

  it("carries a selected frame's members and their bound labels along (copy closure), each with a fresh id", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const rect = { ...newRectangle({ x: 10, y: 10, width: 50, height: 40 }), frameId: frame.id }
    const label = { ...newLabelFor(rect), text: "hi" }
    const rectWithLabel = { ...rect, boundElements: [{ id: label.id, type: "text" as const }] }
    const elements: ExcalidrawElement[] = [rectWithLabel, label, frame]
    const copies = duplicateElements(elements, [frame.id])
    expect(copies).toHaveLength(3)
    const originalIds = new Set(elements.map((e) => e.id))
    for (const c of copies) expect(originalIds.has(c.id)).toBe(false)
    const copiedFrame = copies.find((c) => c.type === "frame")!
    const copiedRect = copies.find((c) => c.type === "rectangle")!
    const copiedLabel = copies.find((c) => c.type === "text")!
    expect(copiedFrame.x).toBe(12)
    expect(copiedRect.frameId).toBe(copiedFrame.id)
    expect(copiedRect.boundElements).toEqual([{ id: copiedLabel.id, type: "text" }])
  })

  it("returns an empty array for an empty selection", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(duplicateElements([a], [])).toEqual([])
  })

  it("does not mutate the input elements", () => {
    const a = newRectangle({ x: 10, y: 20, width: 30, height: 40 })
    duplicateElements([a], [a.id])
    expect(a.x).toBe(10)
    expect(a.y).toBe(20)
  })
})
