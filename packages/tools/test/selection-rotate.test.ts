import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, withModifiers } from "./test-utils"

// For a 100×100 rect at origin, the rotation handle is 20px above the
// top-edge midpoint (50, -20).
const ROTATION_HANDLE = { x: 50, y: -20 }

describe("selection — rotate", () => {
  const setup = () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({
      readElements: () => draft,
      selectedIds: [r.id],
    })
    return { r, draft, ctx }
  }

  it("clicking the rotation handle enters rotating phase", () => {
    const { ctx } = setup()
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: ROTATION_HANDLE },
      ctx,
    )
    expect(r[0].phase).toBe("rotating")
  })

  it("rotating 90° clockwise sets element.angle ≈ +π/2", () => {
    const { r, draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: ROTATION_HANDLE },
      ctx,
    )
    // From center (50,50), rotation handle was at (50,-20) → angle -π/2.
    // To rotate 90° clockwise, drag pointer to angle 0 (i.e. to the right of center).
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 120, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(Math.abs(e.angle - Math.PI / 2)).toBeLessThan(1e-9)
  })

  it("shift snaps to 15° increments", () => {
    const { r, draft, ctx } = setup()
    const ctxShift = { ...ctx, modifiers: withModifiers({ shift: true }) }
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: ROTATION_HANDLE },
      ctxShift,
    )
    // Move the pointer by 1px horizontally — sub-1° rotation, should snap to 0°.
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 51, y: -20 } }, ctxShift)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(e.angle).toBe(0)
  })

  it("shift snaps a 90° rotation to exactly π/2", () => {
    const { r, draft, ctx } = setup()
    const ctxShift = { ...ctx, modifiers: withModifiers({ shift: true }) }
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: ROTATION_HANDLE },
      ctxShift,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 120, y: 50 } }, ctxShift)
    applyMutation(s[1], draft)
    const e = draft.find((x) => x.id === r.id)!
    expect(Math.abs(e.angle - Math.PI / 2)).toBeLessThan(1e-9)
  })

  it("escape restores the original angle", () => {
    const { r, draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: ROTATION_HANDLE },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 120, y: 50 } }, ctx)
    applyMutation(s[1], draft)
    expect(draft.find((x) => x.id === r.id)?.angle).not.toBe(0)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    expect(draft.find((x) => x.id === r.id)?.angle).toBe(0)
  })

  it("pointerUp commits with history (skipHistory undefined)", () => {
    const { ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: ROTATION_HANDLE },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 120, y: 50 } }, ctx)
    const up = selectionTool.reduce(s[0], { type: "pointerUp", at: { x: 120, y: 50 } }, ctx)
    expect(up[0].phase).toBe("idle")
    const mut = up[1].find((e) => e.kind === "mutation")
    if (mut?.kind === "mutation") expect(mut.skipHistory).toBeUndefined()
  })
})
