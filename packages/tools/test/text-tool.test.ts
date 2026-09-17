import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { textTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("text tool", () => {
  it("pointerDown creates an empty text element and enters placing (no edit yet)", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(10, 20) }, ctx)
    applyMutation(r[1], draft)
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe("text")
    expect(r[0]).toEqual({ phase: "placing", elementId: draft[0]?.id })
    expect(r[1].some((e) => e.kind === "startTextEdit")).toBe(false)
  })

  it("pointerMove while placing is ignored", () => {
    const ctx = makeCtx()
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    const move = textTool.reduce(r[0], { type: "pointerMove", at: point(50, 50) }, ctx)
    expect(move).toEqual([r[0], []])
  })

  it("pointerUp while placing commits to idle and starts editing the placed element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    const elementId = draft[0]!.id
    const up = textTool.reduce(r[0], { type: "pointerUp", at: point(0, 0) }, ctx)
    expect(up[0]).toEqual({ phase: "idle" })
    expect(up[1]).toEqual([{ kind: "startTextEdit", elementId }])
  })

  it("escape while placing discards the pending empty element and returns to idle", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = textTool.reduce(textTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    const esc = textTool.reduce(r[0], { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(esc[0]).toEqual({ phase: "idle" })
    expect(draft.length).toBe(0)
  })
})
