import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { textTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("text tool", () => {
  it("pointerDown creates an empty text element + emits startTextEdit", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(10, 20) }, ctx)
    applyMutation(r[1], draft)
    expect(r[0].phase).toBe("editing")
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe("text")
    const startEdit = r[1].find((e) => e.kind === "startTextEdit")
    expect(startEdit).toBeDefined()
    if (startEdit?.kind === "startTextEdit") {
      expect(startEdit.elementId).toBe(draft[0]?.id)
    }
  })

  it("events while editing are mostly ignored", () => {
    const ctx = makeCtx()
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    const move = textTool.reduce(r[0], { type: "pointerMove", at: point(50, 50) }, ctx)
    expect(move[1]).toEqual([])
    const up = textTool.reduce(r[0], { type: "pointerUp", at: point(50, 50) }, ctx)
    expect(up[1]).toEqual([])
  })

  it("escape while editing returns to idle", () => {
    const ctx = makeCtx()
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    const esc = textTool.reduce(r[0], { type: "escape" }, ctx)
    expect(esc[0].phase).toBe("idle")
  })
})
