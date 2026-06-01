import type { GridSnap } from "@excalidraw-clone/geometry"
import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, point, withModifiers } from "./test-utils"

describe("selection — empty space click", () => {
  it("pointerDown over empty space enters marquee + clears selection", () => {
    const ctx = makeCtx({ hitTest: () => null, selectedIds: ["x"] })
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    expect(r[0].phase).toBe("marquee")
    expect(r[1].some((e) => e.kind === "select")).toBe(true)
    const sel = r[1].find((e) => e.kind === "select")
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })

  it("shift + pointerDown over empty space enters marquee WITHOUT clearing", () => {
    const ctx = makeCtx({
      hitTest: () => null,
      selectedIds: ["x"],
      modifiers: withModifiers({ shift: true }),
    })
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    expect(r[0].phase).toBe("marquee")
    expect(r[1].length).toBe(0)
  })
})

describe("selection — click-on-element selects + drags", () => {
  it("click on unselected element emits select and enters dragging with that id", () => {
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const ctx = makeCtx({ hitTest: () => r, readElements: () => [r] })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(10, 10) },
      ctx,
    )
    expect(out[0].phase).toBe("dragging")
    if (out[0].phase === "dragging") expect(out[0].movedIds).toEqual([r.id])
    const sel = out[1].find((e) => e.kind === "select")
    expect(sel).toBeDefined()
    if (sel?.kind === "select") expect(sel.ids).toEqual([r.id])
  })

  it("click on already-selected element enters dragging without re-selecting", () => {
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => [r],
      selectedIds: [r.id],
    })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(10, 10) },
      ctx,
    )
    expect(out[0].phase).toBe("dragging")
    expect(out[1].some((e) => e.kind === "select")).toBe(false)
  })

  it("shift-click on unselected element emits addToSelection + drags multiple", () => {
    const a = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const b = newRectangle({ x: 100, y: 0, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => b,
      readElements: () => [a, b],
      selectedIds: [a.id],
      modifiers: withModifiers({ shift: true }),
    })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(110, 10) },
      ctx,
    )
    expect(out[0].phase).toBe("dragging")
    if (out[0].phase === "dragging") {
      expect(out[0].movedIds).toEqual([a.id, b.id])
    }
    const eff = out[1].find((e) => e.kind === "addToSelection")
    expect(eff).toBeDefined()
  })
})

describe("selection — drag translation", () => {
  it("pointerMove translates moved elements by delta", () => {
    const r = newRectangle({ x: 10, y: 20, width: 30, height: 30 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(15, 25) },
      ctx,
    )
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(35, 45) }, ctx)
    applyMutation(s[1], draft)
    expect(draft[0]?.x).toBe(30)
    expect(draft[0]?.y).toBe(40)
  })

  it("pointerUp ends drag and emits a history-tracked mutation (skipHistory undefined)", () => {
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const ctx = makeCtx({ hitTest: () => r, readElements: () => [r], selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(10, 10) },
      ctx,
    )
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(20, 20) }, ctx)
    const up = selectionTool.reduce(move[0], { type: "pointerUp", at: point(20, 20) }, ctx)
    expect(up[0].phase).toBe("idle")
    const mut = up[1].find((e) => e.kind === "mutation")
    expect(mut).toBeDefined()
    if (mut?.kind === "mutation") expect(mut.skipHistory).toBeUndefined()
  })

  it("escape mid-drag reverts positions to the start", () => {
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(10, 10) },
      ctx,
    )
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(40, 30) }, ctx)
    applyMutation(s[1], draft)
    expect(draft[0]?.x).toBe(30)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    expect(draft[0]?.x).toBe(0)
    expect(draft[0]?.y).toBe(0)
  })
})

describe("selection — keyboard while idle", () => {
  it("delete with selected ids soft-deletes and clears selection", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [a]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: [a.id] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "delete" }, ctx)
    applyMutation(r[1], draft)
    expect(draft[0]?.isDeleted).toBe(true)
    const sel = r[1].find((e) => e.kind === "select")
    expect(sel).toBeDefined()
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })

  it("delete with no selection is a no-op", () => {
    const ctx = makeCtx({ selectedIds: [] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "delete" }, ctx)
    expect(r[1]).toEqual([])
  })

  it("escape clears selection", () => {
    const ctx = makeCtx({ selectedIds: ["x"] })
    const r = selectionTool.reduce(selectionTool.initial, { type: "escape" }, ctx)
    const sel = r[1].find((e) => e.kind === "select")
    if (sel?.kind === "select") expect(sel.ids).toEqual([])
  })
})

describe("selection — drag with grid snap", () => {
  const GRID: GridSnap = { enabled: true, size: 20 }

  it("first pointerMove snaps off-grid element to grid, then delta math takes over", () => {
    const r = newRectangle({ x: 13, y: 27, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => [r],
      grid: GRID,
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    expect(down[0].phase).toBe("dragging")

    // Anchor (13,27) snaps to nearest grid intersection: (20, 20). 27 rounds DOWN to 20
    // (Math.round(27/20)=1). First-move delta from down(20,40) to move(40,40) = (+20, 0).
    // dx = (20-13) + 20 = 27; dy = (20-27) + 0 = -7. Element: 13+27=40, 27-7=20.
    const draft: ExcalidrawElement[] = [{ ...r }]
    const move1 = selectionTool.reduce(down[0], { type: "pointerMove", at: point(40, 40) }, ctx)
    applyMutation(move1[1], draft)
    expect(draft[0]!.x).toBe(40)
    expect(draft[0]!.y).toBe(20)

    // Second pointerMove — pure delta from last(40,40) to at(60,40). +20 x.
    const move2 = selectionTool.reduce(move1[0], { type: "pointerMove", at: point(60, 40) }, ctx)
    applyMutation(move2[1], draft)
    expect(draft[0]!.x).toBe(60)
    expect(draft[0]!.y).toBe(20)
  })

  it("when grid is disabled, drag uses pure delta math (no correction)", () => {
    const r = newRectangle({ x: 13, y: 27, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => [r],
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    const draft: ExcalidrawElement[] = [{ ...r }]
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(30, 40) }, ctx)
    applyMutation(move[1], draft)
    expect(draft[0]!.x).toBe(23)
    expect(draft[0]!.y).toBe(27)
  })

  it("ctrl bypass skips first-move correction even when grid is enabled", () => {
    const r = newRectangle({ x: 13, y: 27, width: 50, height: 50 })
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => [r],
      grid: GRID,
      modifiers: withModifiers({ ctrl: true }),
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    const draft: ExcalidrawElement[] = [{ ...r }]
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(30, 40) }, ctx)
    applyMutation(move[1], draft)
    // Pure delta: +10 x, 0 y. No snap correction.
    expect(draft[0]!.x).toBe(23)
    expect(draft[0]!.y).toBe(27)
  })
})
