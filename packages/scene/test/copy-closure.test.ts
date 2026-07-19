import { describe, expect, it } from "vitest"
import {
  expandIdsToCopyClosure,
  newFrame,
  newLabelFor,
  newRectangle,
  type ExcalidrawElement,
} from "../src"

const labeledRect = () => {
  const rect = newRectangle({ x: 10, y: 10, width: 50, height: 40 })
  const label = { ...newLabelFor(rect), text: "hi" }
  return {
    rect: { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
    label,
  }
}

describe("expandIdsToCopyClosure", () => {
  it("includes a selected shape's bound label", () => {
    const { rect, label } = labeledRect()
    const out = expandIdsToCopyClosure([rect.id], [rect, label])
    expect(out.map((e) => e.id)).toEqual([rect.id, label.id])
  })

  it("includes a selected frame's members and their labels, in scene order", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const { rect, label } = labeledRect()
    const member = { ...rect, frameId: frame.id }
    const elements: ExcalidrawElement[] = [member, label, frame]
    const out = expandIdsToCopyClosure([frame.id], elements)
    expect(out.map((e) => e.id)).toEqual([member.id, label.id, frame.id])
  })

  it("skips deleted elements and unknown ids", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const dead = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), isDeleted: true }
    const out = expandIdsToCopyClosure([a.id, dead.id, "nope"], [a, dead])
    expect(out.map((e) => e.id)).toEqual([a.id])
  })

  it("plain ids pass through without duplicates", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const out = expandIdsToCopyClosure([a.id, b.id, a.id], [a, b])
    expect(out.map((e) => e.id)).toEqual([a.id, b.id])
  })
})
