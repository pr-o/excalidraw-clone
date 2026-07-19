import { newFrame, newRectangle, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { renameFrame } from "../src/driver/renameFrame"

describe("renameFrame", () => {
  it("sets the trimmed name and returns true", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 80 })
    const draft: ExcalidrawElement[] = [frame]
    expect(renameFrame(draft, frame.id, "  Login flow  ")).toBe(true)
    expect(draft[0]!.type === "frame" && draft[0].name).toBe("Login flow")
  })

  it("empty (or whitespace-only) name clears to null", () => {
    const frame = { ...newFrame({ x: 0, y: 0, width: 100, height: 80 }), name: "Old" }
    const draft: ExcalidrawElement[] = [frame]
    expect(renameFrame(draft, frame.id, "   ")).toBe(true)
    expect(draft[0]!.type === "frame" && draft[0].name).toBeNull()
  })

  it("unchanged name returns false and keeps the element reference", () => {
    const frame = { ...newFrame({ x: 0, y: 0, width: 100, height: 80 }), name: "Same" }
    const draft: ExcalidrawElement[] = [frame]
    expect(renameFrame(draft, frame.id, "Same")).toBe(false)
    expect(draft[0]).toBe(frame)
  })

  it("unknown id or non-frame target is a no-op returning false", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [rect]
    expect(renameFrame(draft, "nope", "x")).toBe(false)
    expect(renameFrame(draft, rect.id, "x")).toBe(false)
    expect(draft[0]).toBe(rect)
  })
})
