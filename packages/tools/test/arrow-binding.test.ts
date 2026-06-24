import { describe, expect, it } from "vitest"
import { newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { arrowTool } from "../src/tools/arrow"
import type { ToolContext } from "../src/types"

const target = { ...newRectangle({ x: 400, y: 0, width: 100, height: 100 }), id: "t" }

const ctxWith = (elements: readonly ExcalidrawElement[]): ToolContext => ({
  readElements: () => elements,
  hitTest: () => null,
  viewTransform: { scrollX: 0, scrollY: 0, zoom: 1 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  selectedIds: [],
  grid: { enabled: false, size: 20 },
})

const runDraw = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] => {
  const ctx = ctxWith(elements)
  let state = arrowTool.initial
  const draft: ExcalidrawElement[] = [...elements]
  const apply = (effects: readonly { kind: string }[]) => {
    for (const eff of effects) {
      if (eff.kind === "mutation") {
        ;(eff as unknown as { apply: (d: ExcalidrawElement[]) => void }).apply(draft)
      }
    }
  }
  let [s, e] = arrowTool.reduce(state, { type: "pointerDown", at: from }, ctx)
  apply(e)
  state = s
  ;[s, e] = arrowTool.reduce(state, { type: "pointerMove", at: to }, ctx)
  apply(e)
  state = s
  ;[s, e] = arrowTool.reduce(state, { type: "pointerUp", at: to }, ctx)
  apply(e)
  return draft
}

describe("arrow tool — bind on draw", () => {
  it("binds the end to a shape released over it and adds a back-reference", () => {
    const draft = runDraw({ x: 50, y: 50 }, { x: 450, y: 50 }, [target])
    const arrow = draft.find((e) => e.type === "arrow") as ExcalidrawArrowElement
    expect(arrow.endBinding?.elementId).toBe("t")
    expect(arrow.startBinding).toBeNull()
    const t = draft.find((e) => e.id === "t")!
    expect(t.boundElements?.some((b) => b.id === arrow.id && b.type === "arrow")).toBe(true)
  })

  it("creates no binding when released over empty space", () => {
    const draft = runDraw({ x: 50, y: 50 }, { x: 200, y: 50 }, [target])
    const arrow = draft.find((e) => e.type === "arrow") as ExcalidrawArrowElement
    expect(arrow.startBinding).toBeNull()
    expect(arrow.endBinding).toBeNull()
  })
})
