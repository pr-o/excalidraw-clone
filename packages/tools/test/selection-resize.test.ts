import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, point, withModifiers } from "./test-utils"

const HANDLE_SE = { x: 100, y: 100 }
const HANDLE_SW = { x: 0, y: 100 }
const HANDLE_NW = { x: 0, y: 0 }
const HANDLE_NE = { x: 100, y: 0 }

describe("selection — resize: corner handles", () => {
  const setup = () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({
      readElements: () => draft,
      hitTest: () => null,
      selectedIds: [r.id],
    })
    return { r, draft, ctx }
  }

  it("SE handle drag enlarges width and height", () => {
    const { r, draft, ctx } = setup()
    let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: HANDLE_SE }, ctx)
    expect(s[0].phase).toBe("resizing")
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 150, y: 130 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.x).toBe(0)
    expect(e.y).toBe(0)
    expect(e.width).toBe(150)
    expect(e.height).toBe(130)
  })

  it("NW handle drag moves origin and shrinks width/height", () => {
    const { r, draft, ctx } = setup()
    let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: HANDLE_NW }, ctx)
    expect(s[0].phase).toBe("resizing")
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 20, y: 30 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.x).toBe(20)
    expect(e.y).toBe(30)
    expect(e.width).toBe(80)
    expect(e.height).toBe(70)
  })

  it("NE handle drag moves y and updates width/height", () => {
    const { r, draft, ctx } = setup()
    let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: HANDLE_NE }, ctx)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 130, y: 20 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.x).toBe(0)
    expect(e.y).toBe(20)
    expect(e.width).toBe(130)
    expect(e.height).toBe(80)
  })

  it("SW handle drag moves x and updates width/height", () => {
    const { r, draft, ctx } = setup()
    let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: HANDLE_SW }, ctx)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: -20, y: 130 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.x).toBe(-20)
    expect(e.y).toBe(0)
    expect(e.width).toBe(120)
    expect(e.height).toBe(130)
  })
})

describe("selection — resize: edge handles", () => {
  it("E handle drag changes only width", () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: [r.id] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 50 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 130, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.width).toBe(130)
    expect(e.height).toBe(100)
  })

  it("S handle drag changes only height", () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: [r.id] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 50, y: 100 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 50, y: 140 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.height).toBe(140)
    expect(e.width).toBe(100)
  })
})

describe("selection — resize: shift constrains aspect ratio", () => {
  it("SE handle with shift maintains 1:1 aspect for a square base", () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({
      readElements: () => draft,
      selectedIds: [r.id],
      modifiers: withModifiers({ shift: true }),
    })
    let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: HANDLE_SE }, ctx)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 200, y: 130 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.width).toBe(e.height)
  })
})

describe("selection — resize: commit + escape", () => {
  it("pointerUp emits a history-tracked mutation and returns to idle", () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const ctx = makeCtx({ readElements: () => [r], selectedIds: [r.id] })
    let s = selectionTool.reduce(selectionTool.initial, { type: "pointerDown", at: HANDLE_SE }, ctx)
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 150, y: 150 } }, ctx)
    const up = selectionTool.reduce(s[0], { type: "pointerUp", at: { x: 150, y: 150 } }, ctx)
    expect(up[0].phase).toBe("idle")
    const mut = up[1].find((e) => e.kind === "mutation")
    if (mut?.kind === "mutation") expect(mut.skipHistory).toBeUndefined()
  })

  it("escape restores the original element box", () => {
    const r = newRectangle({ x: 5, y: 7, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ readElements: () => draft, selectedIds: [r.id] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 105, y: 107 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 200, y: 200 } }, ctx)
    applyMutation(s[1], draft)
    expect(draft.find((x) => x.id === r.id)?.width).not.toBe(100)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.x).toBe(5)
    expect(e.y).toBe(7)
    expect(e.width).toBe(100)
    expect(e.height).toBe(100)
  })
})

describe("selection — resize: only single-element resize is supported in v1", () => {
  it("with multi-selection, handle hit returns null and click on empty space goes to marquee", () => {
    const a = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const b = newRectangle({ x: 200, y: 0, width: 100, height: 100 })
    const ctx = makeCtx({
      readElements: () => [a, b],
      selectedIds: [a.id, b.id],
      hitTest: () => null,
    })
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(100, 100) },
      ctx,
    )
    expect(r[0].phase).toBe("marquee")
  })
})
