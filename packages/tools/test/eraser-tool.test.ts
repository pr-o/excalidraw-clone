import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { eraserTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("eraser tool", () => {
  it("pointerDown over an element soft-deletes it (skipHistory)", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({
      readElements: () => [r],
      hitTest: () => r,
    })
    const [_state, effects] = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    applyMutation(effects, draft)
    expect(draft[0]?.isDeleted).toBe(true)
    const mut = effects.find((e) => e.kind === "mutation")
    if (mut?.kind === "mutation") expect(mut.skipHistory).toBe(true)
  })

  it("pointerDown over empty space stays in erasing with no erased ids", () => {
    const ctx = makeCtx({ hitTest: () => null })
    const r = eraserTool.reduce(eraserTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    expect(r[0].phase).toBe("erasing")
    if (r[0].phase === "erasing") expect(r[0].erasedIds).toEqual([])
    expect(r[1]).toEqual([])
  })

  it("pointerMove across multiple elements soft-deletes each one once", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [a, b]
    let elements: readonly ExcalidrawElement[] = [a, b]
    const ctx = makeCtx({
      readElements: () => elements,
      hitTest: (at) => {
        if (at.x < 10) return a
        if (at.x >= 20) return b
        return null
      },
    })
    let s = eraserTool.reduce(eraserTool.initial, { type: "pointerDown", at: point(5, 5) }, ctx)
    applyMutation(s[1], draft)
    elements = draft.filter((e) => !e.isDeleted)
    s = eraserTool.reduce(s[0], { type: "pointerMove", at: point(25, 5) }, ctx)
    applyMutation(s[1], draft)
    expect(draft[0]?.isDeleted).toBe(true)
    expect(draft[1]?.isDeleted).toBe(true)
  })

  it("pointerUp commits a single history-tracked mutation", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ hitTest: () => r })
    const down = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    applyMutation(down[1], draft)
    const up = eraserTool.reduce(down[0], { type: "pointerUp", at: point(5, 5) }, ctx)
    applyMutation(up[1], draft)
    expect(up[0].phase).toBe("idle")
    const muts = up[1].filter((e) => e.kind === "mutation")
    expect(muts.length).toBe(1)
    if (muts[0]?.kind === "mutation") expect(muts[0].skipHistory).toBeUndefined()
  })

  it("escape mid-erase un-soft-deletes everything erased so far", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ hitTest: () => r })
    const down = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    applyMutation(down[1], draft)
    expect(draft[0]?.isDeleted).toBe(true)
    const esc = eraserTool.reduce(down[0], { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(esc[0].phase).toBe("idle")
    expect(draft[0]?.isDeleted).toBe(false)
  })

  it("does not erase the same element twice", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [r]
    const ctx = makeCtx({ hitTest: () => r })
    const down = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    applyMutation(down[1], draft)
    const move = eraserTool.reduce(down[0], { type: "pointerMove", at: point(5, 6) }, ctx)
    expect(move[1]).toEqual([])
    if (move[0].phase === "erasing") expect(move[0].erasedIds.length).toBe(1)
  })
})
