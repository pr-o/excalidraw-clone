import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { makeCtx, point, withModifiers } from "./test-utils"

describe("selection — marquee selection", () => {
  it("drag from empty space; pointerUp emits select with all enclosed ids", () => {
    const a = newRectangle({ x: 10, y: 10, width: 30, height: 30 })
    const b = newRectangle({ x: 60, y: 60, width: 30, height: 30 })
    const c = newRectangle({ x: 200, y: 200, width: 30, height: 30 })
    const ctx = makeCtx({ readElements: () => [a, b, c], hitTest: () => null })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    expect(s[0].phase).toBe("marquee")
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(150, 150) }, ctx)
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: point(150, 150) }, ctx)
    const sel = s[1].find((e) => e.kind === "select")
    expect(sel).toBeDefined()
    if (sel?.kind === "select") {
      expect([...sel.ids].sort()).toEqual([a.id, b.id].sort())
    }
  })

  it("partial overlap is NOT selected (full containment rule)", () => {
    const a = newRectangle({ x: 50, y: 50, width: 200, height: 200 })
    const ctx = makeCtx({ readElements: () => [a], hitTest: () => null })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    const sel = s[1].find((e) => e.kind === "select")
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })

  it("shift-marquee adds to existing selection", () => {
    const a = newRectangle({ x: 10, y: 10, width: 30, height: 30 })
    const existing = "existing-id"
    const ctx = makeCtx({
      readElements: () => [a],
      hitTest: () => null,
      selectedIds: [existing],
      modifiers: withModifiers({ shift: true }),
    })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    // Need shift on pointerUp also for the merge — but ctx.modifiers is read-only,
    // and the marquee state captured baseSelection at down-time. Done.
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: point(60, 60) }, ctx)
    const sel = s[1].find((e) => e.kind === "select")
    if (sel?.kind === "select") {
      expect([...sel.ids].sort()).toEqual([existing, a.id].sort())
    }
  })

  it("locked elements inside the marquee are not selected", () => {
    const a = newRectangle({ x: 10, y: 10, width: 30, height: 30 })
    const b = { ...newRectangle({ x: 60, y: 60, width: 30, height: 30 }), locked: true }
    const ctx = makeCtx({ readElements: () => [a, b], hitTest: () => null })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: point(150, 150) }, ctx)
    const sel = s[1].find((e) => e.kind === "select")
    expect(sel).toBeDefined()
    if (sel?.kind === "select") expect(sel.ids).toEqual([a.id])
  })

  it("marquee fully outside any element selects nothing", () => {
    const a = newRectangle({ x: 500, y: 500, width: 30, height: 30 })
    const ctx = makeCtx({ readElements: () => [a], hitTest: () => null })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerUp", at: point(100, 100) }, ctx)
    const sel = s[1].find((e) => e.kind === "select")
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })
})
