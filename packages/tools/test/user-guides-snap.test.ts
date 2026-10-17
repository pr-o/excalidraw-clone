import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, point, pressAt, withModifiers } from "./test-utils"

const guides = { x: [], y: [200] }

const dragRect = (overrides: Parameters<typeof makeCtx>[0] = {}) => {
  const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
  const draft: ExcalidrawElement[] = [r]
  const ctx = makeCtx({
    hitTest: () => r,
    readElements: () => draft,
    selectedIds: [r.id],
    userGuides: guides,
    ...overrides,
  })
  const down = pressAt(ctx, 10, 10)
  // raw dy = 147 → bottom edge 197, 3px from the guide at y=200.
  const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(10, 157) }, ctx)
  applyMutation(move[1], draft)
  return { el: draft[0]!, effects: move[1] }
}

describe("selection drag — user guide snapping", () => {
  it("snaps the element's bottom edge onto a horizontal user guide", () => {
    const { el, effects } = dragRect()
    expect(el.y + el.height).toBe(200)
    const g = effects.find((e) => e.kind === "setGuides")
    expect(g?.kind === "setGuides" && g.guides[0]?.position).toBe(200)
  })

  it("Ctrl bypasses user guide snapping", () => {
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({
      hitTest: () => r,
      readElements: () => draft,
      selectedIds: [r.id],
      userGuides: guides,
      modifiers: withModifiers({ ctrl: true }),
    })
    const down = pressAt(ctx, 10, 10)
    const move = selectionTool.reduce(down[0], { type: "pointerMove", at: point(10, 157) }, ctx)
    applyMutation(move[1], draft)
    expect(draft[0]!.y).toBe(147)
  })

  it("no snapping without user guides in context", () => {
    const { el } = dragRect({ userGuides: { x: [], y: [] } })
    expect(el.y).toBe(147)
  })
})

describe("selection resize — user guide snapping", () => {
  const setup = (userGuides = { x: [153], y: [] as number[] }) => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({
      readElements: () => draft,
      hitTest: () => null,
      selectedIds: [r.id],
      userGuides,
    })
    return { draft, ctx }
  }

  it("snaps the dragged east edge onto a vertical user guide", () => {
    const { draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 100 } },
      ctx,
    )
    expect(s[0].phase).toBe("resizing")
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 150, y: 130 } }, ctx)
    applyMutation(s[1], draft)
    expect(draft[0]!.width).toBe(153)
    expect(draft[0]!.height).toBe(130)
    const g = s[1].find((e) => e.kind === "setGuides")
    expect(g?.kind === "setGuides" && g.guides.length).toBe(1)
  })

  it("leaves the resize alone when no guide is within threshold", () => {
    const { draft, ctx } = setup({ x: [300], y: [] })
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: { x: 100, y: 100 } },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: { x: 150, y: 130 } }, ctx)
    applyMutation(s[1], draft)
    expect(draft[0]!.width).toBe(150)
  })
})
