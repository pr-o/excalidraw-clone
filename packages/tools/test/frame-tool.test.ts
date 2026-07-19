import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { Scene, newRectangle } from "@excalidraw-clone/scene"
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

  it("zero-area frame is dropped", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(0, 0) }, ctx)
    applyMutation(up[1], draft)
    expect(draft).toEqual([])
  })

  it("membership is stamped by the scene invariant on commit", () => {
    // The tool no longer stamps frameId itself; Scene.mutate's
    // reconcileFrameMembership claims fully-contained elements.
    const inside = newRectangle({ x: 10, y: 10, width: 20, height: 20 })
    const outside = newRectangle({ x: 200, y: 200, width: 20, height: 20 })
    const scene = new Scene([inside, outside])
    const ctx = makeCtx({ readElements: () => [...scene.getElements()] })
    const down = frameTool.reduce(frameTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    scene.mutate((d) => applyMutation(down[1], d))
    const up = frameTool.reduce(down[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    scene.mutate((d) => applyMutation(up[1], d))
    const frame = scene.getElements().find((e) => e.type === "frame")!
    expect(scene.getElements().find((e) => e.id === inside.id)?.frameId).toBe(frame.id)
    expect(scene.getElements().find((e) => e.id === outside.id)?.frameId).toBeNull()
  })
})
