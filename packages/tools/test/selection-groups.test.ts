import { newRectangle, newText } from "@excalidraw-clone/scene"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { makeCtx, point, withModifiers } from "./test-utils"

const rect = (x: number): ExcalidrawElement => newRectangle({ x, y: 0, width: 10, height: 10 })
const inGroup = (el: ExcalidrawElement, gid: string): ExcalidrawElement => ({
  ...el,
  groupIds: [gid],
})

describe("selection — groups", () => {
  it("pointerDown on a grouped member selects the whole group", () => {
    const a = inGroup(rect(0), "g1")
    const b = inGroup(rect(20), "g1")
    const ctx = makeCtx({ readElements: () => [a, b], hitTest: () => a })
    const [state, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    const sel = effects.find((e) => e.kind === "select")
    expect(sel && sel.kind === "select" ? [...sel.ids] : []).toEqual([a.id, b.id])
    expect(state.phase).toBe("dragging")
    if (state.phase === "dragging") expect([...state.movedIds]).toEqual([a.id, b.id])
  })

  it("shift-click adds the whole group to the selection", () => {
    const a = inGroup(rect(0), "g1")
    const b = inGroup(rect(20), "g1")
    const other = rect(40)
    const ctx = makeCtx({
      readElements: () => [a, b, other],
      hitTest: () => a,
      selectedIds: [other.id],
      modifiers: withModifiers({ shift: true }),
    })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    const add = effects.find((e) => e.kind === "addToSelection")
    expect(add && add.kind === "addToSelection" ? [...add.ids] : []).toEqual([a.id, b.id])
  })

  it("marquee touching one member selects the whole group", () => {
    const a = inGroup(rect(0), "g1")
    const far = inGroup(rect(500), "g1") // outside the marquee, same group
    const ctx = makeCtx({ readElements: () => [a, far], hitTest: () => null })
    const [afterDown] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(-5, -5) },
      ctx,
    )
    const [afterMove] = selectionTool.reduce(
      afterDown,
      { type: "pointerMove", at: point(15, 15) },
      ctx,
    )
    const [, effects] = selectionTool.reduce(
      afterMove,
      { type: "pointerUp", at: point(15, 15) },
      ctx,
    )
    const sel = effects.find((e) => e.kind === "select")
    expect(sel && sel.kind === "select" ? [...sel.ids] : []).toEqual([a.id, far.id])
  })

  it("double-click on a grouped member drills in to select only that member", () => {
    const a = inGroup(rect(0), "g1")
    const b = inGroup(rect(20), "g1")
    const ctx = makeCtx({
      readElements: () => [a, b],
      hitTest: () => a,
      selectedIds: [a.id, b.id],
    })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    const sel = effects.find((e) => e.kind === "select")
    expect(sel && sel.kind === "select" ? [...sel.ids] : []).toEqual([a.id])
    expect(effects.some((e) => e.kind === "startTextEdit")).toBe(false)
  })

  it("double-click on an already drilled-in note member starts text edit", () => {
    const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
    const container = {
      ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
      id: "C",
      groupIds: ["g1"],
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    const ctx = makeCtx({
      readElements: () => [container, text],
      hitTest: () => container,
      selectedIds: [container.id],
    })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    const eff = effects.find((e) => e.kind === "startTextEdit")
    expect(eff).toBeDefined()
    if (eff?.kind === "startTextEdit") expect(eff.elementId).toBe(text.id)
  })

  it("pointerDown on an ungrouped element still selects only that element", () => {
    const a = rect(0)
    const b = rect(20)
    const ctx = makeCtx({ readElements: () => [a, b], hitTest: () => a })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    const sel = effects.find((e) => e.kind === "select")
    expect(sel && sel.kind === "select" ? [...sel.ids] : []).toEqual([a.id])
  })
})
