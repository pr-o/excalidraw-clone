import { newArrow } from "@excalidraw-clone/scene"
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

describe("selection — bend dragging", () => {
  it("grabbing a segment midpoint inserts a point and enters bendDragging", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    const s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 0 } },
      ctx,
    )
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("bendDragging")
    if (s[0].phase === "bendDragging") expect(s[0].index).toBe(1)
    expect((draft[0] as ExcalidrawArrowElement).points.length).toBe(3)
  })

  it("drag + up commits the new bend (3 points, back to idle)", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 0 } },
      ctx,
    )
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 50, y: 60 } }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: { x: 50, y: 60 } }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    const e = draft[0] as ExcalidrawArrowElement
    expect(e.points.length).toBe(3)
    expect({ x: e.x + e.points[1]!.x, y: e.y + e.points[1]!.y }).toEqual({ x: 50, y: 60 })
  })

  it("double-clicking an interior bend removes it", () => {
    const a: ExcalidrawArrowElement = {
      ...arrow(),
      height: 60,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 60 },
        { x: 100, y: 0 },
      ],
    }
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    const s = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: { x: 50, y: 60 } },
      ctx,
    )
    applyMutation(s[1], draft)
    expect((draft[0] as ExcalidrawArrowElement).points.length).toBe(2)
  })

  it("escape reverts an added bend", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: ["ar"] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 0 } },
      ctx,
    )
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 50, y: 200 } }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    expect((draft[0] as ExcalidrawArrowElement).points.length).toBe(2)
  })
})
