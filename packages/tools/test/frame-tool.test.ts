import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { frameTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("frame tool", () => {
  it("drag creates a frame element of type 'frame'", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    applyMutation(up[1], draft)
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe("frame")
  })

  it("fully-contained elements get frameId set on commit", () => {
    const inside = newRectangle({ x: 10, y: 10, width: 20, height: 20 })
    const outside = newRectangle({ x: 200, y: 200, width: 20, height: 20 })
    const draft: ExcalidrawElement[] = [inside, outside]
    const ctx = makeCtx({ readElements: () => draft })
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    applyMutation(up[1], draft)
    const frame = draft.find((e) => e.type === "frame")!
    expect(draft.find((e) => e.id === inside.id)?.frameId).toBe(frame.id)
    expect(draft.find((e) => e.id === outside.id)?.frameId).toBeNull()
  })

  it("partially-overlapping elements are NOT included (full containment only)", () => {
    const partial = newRectangle({ x: 80, y: 80, width: 50, height: 50 })
    const draft: ExcalidrawElement[] = [partial]
    const ctx = makeCtx({ readElements: () => draft })
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    applyMutation(up[1], draft)
    expect(draft.find((e) => e.id === partial.id)?.frameId).toBeNull()
  })

  it("zero-area frame is dropped", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(0, 0) }, ctx)
    applyMutation(up[1], draft)
    expect(draft).toEqual([])
  })

  it("does not steal elements that already belong to another frame", () => {
    const otherFrameId = "frame-existing"
    const claimed = {
      ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }),
      frameId: otherFrameId,
    }
    const draft: ExcalidrawElement[] = [claimed]
    const ctx = makeCtx({ readElements: () => draft })
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    applyMutation(up[1], draft)
    expect(draft.find((e) => e.id === claimed.id)?.frameId).toBe(otherFrameId)
  })
})
