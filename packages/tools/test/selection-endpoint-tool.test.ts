import { newArrow, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx } from "./test-utils"

const arrow = (): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  id: "ar",
  x: 0,
  y: 0,
  width: 100,
  height: 0,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
})

describe("selection — endpoint dragging", () => {
  it("pointerDown on an endpoint enters endpointDragging", () => {
    const a = arrow()
    const ctx = makeCtx({ readElements: () => [a], selectedIds: ["ar"] })
    const s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 0 } },
      ctx,
    )
    expect(s[0].phase).toBe("endpointDragging")
    if (s[0].phase === "endpointDragging") expect(s[0].end).toBe("end")
  })

  it("drag + up over a shape binds the endpoint to it", () => {
    const t = { ...newRectangle({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
    const a = arrow()
    const draft: ExcalidrawElement[] = [t, a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 0 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 250, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    if (s[0].phase === "endpointDragging") expect(s[0].candidateBindId).toBe("t")
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: { x: 250, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    const e = draft.find((x) => x.id === "ar") as ExcalidrawArrowElement
    expect(e.endBinding?.elementId).toBe("t")
  })

  it("escape restores original geometry", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 0 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 400, y: 400 } }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(e.x + e.points[1]!.x).toBe(100)
    expect(e.y + e.points[1]!.y).toBe(0)
  })
})
