import { newArrow, newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { canMoveElementToPage } from "../src/driver/moveToPage"

describe("canMoveElementToPage", () => {
  it("allows a plain, unbound, ungrouped, unframed element", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(canMoveElementToPage(rect, [rect])).toBe(true)
  })

  it("disallows an element that belongs to a group", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), groupIds: ["g1"] }
    expect(canMoveElementToPage(rect, [rect])).toBe(false)
  })

  it("disallows an element that is a member of a frame", () => {
    const rect = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), frameId: "f1" }
    expect(canMoveElementToPage(rect, [rect])).toBe(false)
  })

  it("disallows a container with a bound label riding along", () => {
    const text = newText({ x: 0, y: 0, text: "hi" })
    const rect = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    expect(canMoveElementToPage(rect, [rect, text])).toBe(false)
  })

  it("disallows bound text that lives inside a container", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const text = { ...newText({ x: 0, y: 0, text: "hi" }), containerId: rect.id }
    expect(canMoveElementToPage(text, [rect, text])).toBe(false)
  })

  it("disallows an arrow with a startBinding", () => {
    const target = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      startBinding: { elementId: target.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(arrow, [target, arrow])).toBe(false)
  })

  it("disallows an arrow with an endBinding", () => {
    const target = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      endBinding: { elementId: target.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(arrow, [target, arrow])).toBe(false)
  })

  it("disallows an element that another arrow's startBinding targets", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      startBinding: { elementId: rect.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(rect, [rect, arrow])).toBe(false)
  })

  it("disallows an element that another arrow's endBinding targets", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      endBinding: { elementId: rect.id, focus: 0, gap: 4 },
    }
    expect(canMoveElementToPage(rect, [rect, arrow])).toBe(false)
  })

  it("allows an arrow that has neither its own bindings nor is targeted by another", () => {
    const arrow = newArrow({ x: 0, y: 0 })
    const other = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
    expect(canMoveElementToPage(arrow, [arrow, other])).toBe(true)
  })
})
