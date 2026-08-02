import { newFrame, newLabelFor, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { pickElementAtPoint } from "../src/driver/hitTest"

describe("pickElementAtPoint", () => {
  it("returns the topmost element under the point", () => {
    const a = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const b = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    expect(pickElementAtPoint([a, b], { x: 50, y: 50 })?.id).toBe(b.id)
  })

  it("returns null when nothing is under the point", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(pickElementAtPoint([a], { x: 500, y: 500 })).toBeNull()
  })

  it("skips locked elements by default", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), locked: true }
    expect(pickElementAtPoint([a], { x: 50, y: 50 })).toBeNull()
  })

  it("includes locked elements when includeLocked is true", () => {
    const a = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), locked: true }
    expect(pickElementAtPoint([a], { x: 50, y: 50 }, { includeLocked: true })?.id).toBe(a.id)
  })

  it("skips bound text elements (containerId set)", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const label = newLabelFor(rect)
    expect(pickElementAtPoint([rect, label], { x: 50, y: 50 })?.id).toBe(rect.id)
  })

  it("treats frames as lowest priority — a member element wins over its frame", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const member = { ...newRectangle({ x: 50, y: 50, width: 20, height: 20 }), frameId: frame.id }
    expect(pickElementAtPoint([frame, member], { x: 60, y: 60 })?.id).toBe(member.id)
  })

  it("returns the frame when the point is over its empty interior", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const member = { ...newRectangle({ x: 50, y: 50, width: 20, height: 20 }), frameId: frame.id }
    expect(pickElementAtPoint([frame, member], { x: 150, y: 150 })?.id).toBe(frame.id)
  })
})
