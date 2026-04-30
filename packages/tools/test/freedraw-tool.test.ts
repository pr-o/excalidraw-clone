import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { freedrawTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

const PointArrSchema = (count: number): { x: number; y: number }[] =>
  Array.from({ length: count }, () => ({ x: 0, y: 0 }))

describe("freedraw tool", () => {
  it("pointerDown creates a freedraw element with one initial point", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = freedrawTool.reduce(
      freedrawTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    applyMutation(r[1], draft)
    expect(r[0].phase).toBe("drawing")
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe("freedraw")
  })

  it("each pointerMove appends a point; final element has all points", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let s = freedrawTool.reduce(freedrawTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(s[1], draft)
    const moves = [point(1, 1), point(3, 2), point(5, 0), point(8, 4), point(10, 5)]
    for (const at of moves) {
      s = freedrawTool.reduce(s[0], { type: "pointerMove", at }, ctx)
      applyMutation(s[1], draft)
    }
    s = freedrawTool.reduce(s[0], { type: "pointerUp", at: point(10, 5) }, ctx)
    applyMutation(s[1], draft)
    expect(s[0].phase).toBe("idle")
    const e = draft[0] as ExcalidrawElement & { points?: { x: number; y: number }[] }
    // 1 down + 5 moves = 6 points
    expect(e.points?.length).toBe(6)
    void PointArrSchema
  })

  it("pointerUp with only a single point (no moves) drops the element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = freedrawTool.reduce(
      freedrawTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    applyMutation(down[1], draft)
    const up = freedrawTool.reduce(down[0], { type: "pointerUp", at: point(0, 0) }, ctx)
    applyMutation(up[1], draft)
    expect(up[0].phase).toBe("idle")
    expect(draft).toEqual([])
    expect(up[1].some((e) => e.kind === "select")).toBe(false)
  })

  it("escape mid-draw removes the element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let s = freedrawTool.reduce(freedrawTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(s[1], draft)
    s = freedrawTool.reduce(s[0], { type: "pointerMove", at: point(10, 10) }, ctx)
    applyMutation(s[1], draft)
    const esc = freedrawTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(esc[0].phase).toBe("idle")
    expect(draft).toEqual([])
  })

  it("pointerUp emits select + switchTool with the new id", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = freedrawTool.reduce(
      freedrawTool.initial,
      { type: "pointerDown", at: point(0, 0) },
      ctx,
    )
    applyMutation(down[1], draft)
    const move = freedrawTool.reduce(down[0], { type: "pointerMove", at: point(10, 10) }, ctx)
    applyMutation(move[1], draft)
    const up = freedrawTool.reduce(move[0], { type: "pointerUp", at: point(10, 10) }, ctx)
    expect(up[1].some((e) => e.kind === "select")).toBe(true)
    expect(up[1].some((e) => e.kind === "switchTool")).toBe(true)
  })

  it("element bounds are computed from points (bbox)", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let s = freedrawTool.reduce(freedrawTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(s[1], draft)
    s = freedrawTool.reduce(s[0], { type: "pointerMove", at: point(20, 30) }, ctx)
    applyMutation(s[1], draft)
    s = freedrawTool.reduce(s[0], { type: "pointerUp", at: point(20, 30) }, ctx)
    applyMutation(s[1], draft)
    const e = draft[0]!
    expect(e.x).toBe(0)
    expect(e.y).toBe(0)
    expect(e.width).toBe(20)
    expect(e.height).toBe(30)
  })
})
