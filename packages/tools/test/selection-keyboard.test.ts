import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx } from "./test-utils"

describe("selection — keyboard", () => {
  it("delete with two selected elements emits one mutation that flips isDeleted on both", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 50, width: 10, height: 10 })
    const c = newRectangle({ x: 100, y: 100, width: 10, height: 10 })
    const ctx = makeCtx({ readElements: () => [a, b, c], selectedIds: [a.id, b.id] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "delete" }, ctx)

    const mutations = r[1].filter((e) => e.kind === "mutation")
    expect(mutations).toHaveLength(1)

    const draft: ExcalidrawElement[] = [a, b, c]
    applyMutation(r[1], draft)
    expect(draft.find((e) => e.id === a.id)?.isDeleted).toBe(true)
    expect(draft.find((e) => e.id === b.id)?.isDeleted).toBe(true)
    expect(draft.find((e) => e.id === c.id)?.isDeleted).toBe(false)

    const sel = r[1].find((e) => e.kind === "select")
    expect(sel).toBeDefined()
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })

  it("delete with no selection is a no-op", () => {
    const ctx = makeCtx({ selectedIds: [] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "delete" }, ctx)
    expect(r[0].phase).toBe("idle")
    expect(r[1]).toEqual([])
  })

  it("escape while idle with selection clears selection", () => {
    const ctx = makeCtx({ selectedIds: ["x", "y"] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "escape" }, ctx)
    expect(r[0].phase).toBe("idle")
    const sel = r[1].find((e) => e.kind === "select")
    expect(sel).toBeDefined()
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })

  it("escape while idle with no selection is a no-op", () => {
    const ctx = makeCtx({ selectedIds: [] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "escape" }, ctx)
    expect(r[0].phase).toBe("idle")
    expect(r[1]).toEqual([])
  })
})
