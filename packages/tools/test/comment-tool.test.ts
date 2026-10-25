import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { commentTool } from "../src"
import { makeCtx, point } from "./test-utils"

describe("comment tool", () => {
  it("pointerUp on empty canvas places a point-anchored comment and returns to selection", () => {
    const [, effects] = commentTool.reduce(
      commentTool.initial,
      { type: "pointerUp", at: point(3, 4) },
      makeCtx(),
    )
    expect(effects).toEqual([
      { kind: "placeComment", anchor: { kind: "point", x: 3, y: 4 } },
      { kind: "switchTool", tool: "selection" },
    ])
  })

  it("pointerUp over an element anchors to it", () => {
    const rect = newRectangle({ x: 10, y: 10, width: 20, height: 20 })
    const [, effects] = commentTool.reduce(
      commentTool.initial,
      { type: "pointerUp", at: point(15, 12) },
      makeCtx({ hitTest: () => rect }),
    )
    expect(effects[0]).toEqual({
      kind: "placeComment",
      anchor: { kind: "element", elementId: rect.id, dx: 5, dy: 2 },
    })
  })

  it("ignores other events", () => {
    const [, effects] = commentTool.reduce(
      commentTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      makeCtx(),
    )
    expect(effects).toEqual([])
  })
})
