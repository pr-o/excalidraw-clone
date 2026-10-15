import { newImage, newRectangle, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool, type SelectionState } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

const setup = () => {
  const img = newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f1" })
  const draft: ExcalidrawElement[] = [img]
  const ctx = makeCtx({ readElements: () => draft, hitTest: () => img, selectedIds: [img.id] })
  return { img, draft, ctx }
}
const enter = (ctx: ReturnType<typeof setup>["ctx"]) =>
  selectionTool.reduce(selectionTool.initial, { type: "doubleClick", at: point(50, 50) }, ctx)

describe("selection — image crop mode", () => {
  it("double-click on an image enters cropping, selects it and emits setCrop", () => {
    const { img, ctx } = setup()
    const [state, effects] = enter(ctx)
    expect(state).toEqual({ phase: "cropping", elementId: img.id })
    expect(effects).toContainEqual({ kind: "select", ids: [img.id] })
    expect(effects).toContainEqual({ kind: "setCrop", elementId: img.id })
  })

  it("double-click on an image with no file does not enter crop", () => {
    const img = newImage({ x: 0, y: 0, width: 100, height: 100 })
    const ctx = makeCtx({ readElements: () => [img], hitTest: () => img })
    const [state] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    expect(state.phase).toBe("idle")
  })

  it("pressing a handle in crop mode starts cropDragging and a move crops the image", () => {
    const { img, draft, ctx } = setup()
    let [s] = enter(ctx)
    let effects
    ;[s] = selectionTool.reduce(s, { type: "pointerDown", at: point(0, 50) }, ctx) // west handle
    expect(s.phase).toBe("cropDragging")
    ;[s, effects] = selectionTool.reduce(s, { type: "pointerMove", at: point(20, 50) }, ctx)
    applyMutation(effects, draft)
    const e = draft[0] as typeof img
    expect(e.width).toBe(80)
    expect(e.crop).toEqual({ x: 0.2, y: 0, width: 0.8, height: 1 })
    ;[s, effects] = selectionTool.reduce(s, { type: "pointerUp", at: point(20, 50) }, ctx)
    expect(s).toEqual({ phase: "cropping", elementId: img.id })
    // The commit effect is a (history-recorded) mutation that leaves the crop intact.
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ kind: "mutation" })
    expect(effects[0]).not.toHaveProperty("skipHistory", true)
    applyMutation(effects, draft)
    expect((draft[0] as typeof img).crop).toEqual({ x: 0.2, y: 0, width: 0.8, height: 1 })
  })

  it("escape mid-drag restores box and crop and stays in crop mode", () => {
    const { img, draft, ctx } = setup()
    let [s] = enter(ctx)
    let effects
    ;[s] = selectionTool.reduce(s, { type: "pointerDown", at: point(0, 50) }, ctx)
    ;[s, effects] = selectionTool.reduce(s, { type: "pointerMove", at: point(20, 50) }, ctx)
    applyMutation(effects, draft)
    ;[s, effects] = selectionTool.reduce(s, { type: "escape" }, ctx)
    applyMutation(effects, draft)
    const e = draft[0] as typeof img
    expect(e).toMatchObject({ id: img.id, x: 0, width: 100, crop: null })
    expect(s.phase).toBe("cropping")
  })

  it("escape in crop mode exits and keeps the crop", () => {
    const { ctx } = setup()
    const [s] = enter(ctx)
    const [next, effects] = selectionTool.reduce(s, { type: "escape" }, ctx)
    expect(next.phase).toBe("idle")
    expect(effects).toContainEqual({ kind: "setCrop", elementId: null })
  })

  it("clicking elsewhere exits crop mode and runs the normal idle press", () => {
    const { img } = setup()
    const other = newRectangle({ x: 300, y: 0, width: 50, height: 50 })
    const ctx = makeCtx({
      readElements: () => [img, other],
      hitTest: () => other,
      selectedIds: [img.id],
    })
    const crop: SelectionState = { phase: "cropping", elementId: img.id }
    const [next, effects] = selectionTool.reduce(
      crop,
      { type: "pointerDown", at: point(320, 20) },
      ctx,
    )
    expect(effects).toContainEqual({ kind: "setCrop", elementId: null })
    expect(effects).toContainEqual({ kind: "select", ids: [other.id] })
    expect(next.phase).toBe("dragging")
  })
})
