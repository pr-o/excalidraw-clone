import type { GridSnap } from "@excalidraw-clone/geometry"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { BINDING_GAP, newArrow, newFrame, newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { translateElements } from "../src/tools/selection/drag"
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

  it("clicking a frame drags its members too but selects only the frame", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const outside = newRectangle({ x: 300, y: 300, width: 20, height: 20 })
    const ctx = makeCtx({ hitTest: () => frame, readElements: () => [frame, member, outside] })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(50, 50) },
      ctx,
    )
    expect(out[0].phase).toBe("dragging")
    if (out[0].phase === "dragging") {
      expect([...out[0].movedIds].sort()).toEqual([frame.id, member.id].sort())
    }
    const sel = out[1].find((e) => e.kind === "select")
    expect(sel && sel.kind === "select" && sel.ids).toEqual([frame.id])
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

// These fixtures use 10x10 movers, smaller than the resize-handle hit box (6px
// half-extent around each handle point), so *every* point inside them is within
// reach of a corner handle and would start a resize instead of a drag. `hitTest`
// is stubbed and only the pointer *delta* feeds the drag math, so the pointer is
// parked at DRAG_POINTER_Y — clear of every handle, deltas unchanged.
const DRAG_POINTER_Y = 40

describe("selection — drag alignment guides", () => {
  it("emits a setGuides effect and folds the correction into dx when near a candidate edge", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    applyMutation(move[1], draft)
    // raw dx = 20 (far edge 30), alignment correction -2 (candidate near edge 28)
    expect(draft[0]!.x).toBe(18)
    expect(draft[0]!.y).toBe(0)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff).toBeDefined()
    if (guidesEff?.kind === "setGuides") {
      // Perpendicular (y) extent is the min/max of BOTH the mover's (0..10)
      // and the candidate's (500..510) y ranges, per computeAlignmentSnap's
      // bestAxisMatch — they don't overlap, so the combined range is 0..510.
      expect(guidesEff.guides).toEqual([{ axis: "x", position: 28, start: 0, end: 510 }])
    }
  })

  it("grid enabled suppresses alignment guides entirely even near a candidate edge", () => {
    const r = newRectangle({ x: 20, y: 20, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 48, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => draft,
      selectedIds: [r.id],
      grid: { enabled: true, size: 20 },
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(45, DRAG_POINTER_Y) },
      ctx,
    )
    applyMutation(move[1], draft)
    // Pure grid-path delta (anchor already on-grid, +20 from the pointer) — no alignment.
    expect(draft[0]!.x).toBe(40)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([])
  })

  it("ctrl bypasses alignment guides even when a candidate edge is within threshold", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => draft,
      selectedIds: [r.id],
      modifiers: withModifiers({ ctrl: true }),
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    applyMutation(move[1], draft)
    // Pure delta (+20), no alignment correction.
    expect(draft[0]!.x).toBe(20)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([])
  })

  it("multi-selection uses the combined bounding box, not a single member's bounds", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = { ...newRectangle({ x: 40, y: 0, width: 10, height: 10 }), id: "b" }
    // Candidate's center (25) matches the combined bbox's center (25) exactly;
    // neither a's own center (5) nor b's own center (45) is within the 8px threshold of it.
    const c = { ...newRectangle({ x: 21, y: 500, width: 8, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [a, b, c]
    const ctx = makeCtx({
      hitTest: () => a,
      readElements: () => draft,
      selectedIds: [a.id, b.id],
    })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    expect(down[0].phase).toBe("dragging")
    if (down[0].phase === "dragging") expect(down[0].movedIds).toEqual([a.id, b.id])
    // Zero-delta move: pointer hasn't moved, so movingBounds equals the combined bbox exactly.
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([
      { axis: "x", position: 25, start: 0, end: 510 },
    ])
  })

  it("pointerUp and escape both clear guides", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    const up = selectionTool.reduce(
      move[0],
      { type: "pointerUp", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    const upGuides = up[1].find((e) => e.kind === "setGuides")
    expect(upGuides?.kind === "setGuides" && upGuides.guides).toEqual([])

    const escape = selectionTool.reduce(move[0], { type: "escape" }, ctx)
    const escGuides = escape[1].find((e) => e.kind === "setGuides")
    expect(escGuides?.kind === "setGuides" && escGuides.guides).toEqual([])
  })

  it("does not glue the element to a guide across consecutive small pointer moves", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    let state = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )[0]
    const moveTo = (x: number): void => {
      const [next, effects] = selectionTool.reduce(
        state,
        { type: "pointerMove", at: point(x, DRAG_POINTER_Y) },
        ctx,
      )
      applyMutation(effects, draft)
      state = next
    }
    moveTo(25)
    // raw +20 → far edge 30, snapped -2 onto candidate near edge 28.
    expect(draft[0]!.x).toBe(18)
    moveTo(28)
    // raw total +23 → uncorrected edges 23/28/33 hit candidate 28/33 exactly
    // (zero correction) — the element must track the cursor, not stay at 18.
    expect(draft[0]!.x).toBe(23)
    // Each step is +6 (within the 8px threshold) but the total travel leaves
    // every candidate edge far behind: the element lands on the raw position.
    for (const x of [34, 40, 46, 52, 58, 61]) moveTo(x)
    expect(draft[0]!.x).toBe(56)
    expect(draft[0]!.y).toBe(0)
  })

  it("escape after an alignment-corrected drag restores the exact original position", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const c = { ...newRectangle({ x: 28, y: 500, width: 10, height: 10 }), id: "c" }
    const draft: ExcalidrawElement[] = [r, c]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    applyMutation(move[1], draft)
    expect(draft[0]!.x).toBe(18) // correction -2 is baked in
    const escape = selectionTool.reduce(move[0], { type: "escape" }, ctx)
    applyMutation(escape[1], draft)
    expect(draft[0]!.x).toBe(0)
    expect(draft[0]!.y).toBe(0)
    expect(draft[1]!.x).toBe(28)
    expect(draft[1]!.y).toBe(500)
  })

  it("excludes bound text labels from snap candidates", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const container = {
      ...newRectangle({ x: 300, y: 300, width: 100, height: 100 }),
      id: "box",
      boundElements: [{ id: "lbl", type: "text" as const }],
    }
    // Stale label geometry whose near edge (28) would otherwise attract the
    // mover's far edge (30 after a +20 drag).
    const label = {
      ...newText({ x: 28, y: 500, width: 10, height: 10, text: "hi", containerId: "box" }),
      id: "lbl",
    }
    const draft: ExcalidrawElement[] = [r, container, label]
    const ctx = makeCtx({ hitTest: () => r, readElements: () => draft, selectedIds: [r.id] })
    const down = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(5, DRAG_POINTER_Y) },
      ctx,
    )
    const move = selectionTool.reduce(
      down[0],
      { type: "pointerMove", at: point(25, DRAG_POINTER_Y) },
      ctx,
    )
    applyMutation(move[1], draft)
    expect(draft[0]!.x).toBe(20)
    const guidesEff = move[1].find((e) => e.kind === "setGuides")
    expect(guidesEff?.kind === "setGuides" && guidesEff.guides).toEqual([])
  })
})

const makeBoundPair = (): ExcalidrawElement[] => {
  const target = {
    ...newRectangle({ x: 400, y: 0, width: 100, height: 100 }),
    id: "t",
    boundElements: [{ id: "ar", type: "arrow" as const }],
  }
  const arrow: ExcalidrawArrowElement = {
    ...newArrow({ x: 0, y: 50 }),
    id: "ar",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    width: 100,
    height: 0,
    endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
  }
  return [target, arrow]
}

describe("translateElements — binding teardown", () => {
  it("unbinds an arrow dragged alone and clears the back-reference", () => {
    const draft = makeBoundPair()
    translateElements(draft, ["ar"], 10, 10)
    const arrow = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    const target = draft.find((e) => e.id === "t")!
    expect(arrow.endBinding).toBeNull()
    expect(target.boundElements ?? []).toHaveLength(0)
  })

  it("keeps the binding when arrow and target move together", () => {
    const draft = makeBoundPair()
    translateElements(draft, ["ar", "t"], 10, 10)
    const arrow = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(arrow.endBinding?.elementId).toBe("t")
  })
})
