import { newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { makeCtx, point } from "./test-utils"

describe("selection — double click", () => {
  it("double-click on a text element emits startTextEdit", () => {
    const t = newText({ x: 0, y: 0, text: "hi" })
    const ctx = makeCtx({ readElements: () => [t], hitTest: () => t })
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    const eff = r[1].find((e) => e.kind === "startTextEdit")
    expect(eff).toBeDefined()
    if (eff?.kind === "startTextEdit") expect(eff.elementId).toBe(t.id)
  })

  it("double-click on a non-text element is a no-op", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const ctx = makeCtx({ hitTest: () => r })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    expect(out[1]).toEqual([])
  })

  it("double-click on empty space is a no-op", () => {
    const ctx = makeCtx({ hitTest: () => null })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    expect(out[1]).toEqual([])
  })
})
