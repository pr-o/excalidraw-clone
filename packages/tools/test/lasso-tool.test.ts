import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { lassoTool } from "../src"
import { NO_MODIFIERS, makeCtx } from "./test-utils"

const at = (x: number, y: number) => ({ x, y })
const small = newRectangle({ x: 10, y: 10, width: 10, height: 10 })
const far = newRectangle({ x: 200, y: 200, width: 10, height: 10 })
const locked = { ...newRectangle({ x: 12, y: 12, width: 4, height: 4 }), locked: true }

/** Drive the tool through a closed square path around (0,0)-(50,50). */
const drag = (ctx = makeCtx({ readElements: () => [small, far, locked] })) => {
  let state = lassoTool.initial
  for (const p of [at(0, 0), at(50, 0), at(50, 50), at(0, 50)]) {
    const type = state.phase === "idle" ? "pointerDown" : "pointerMove"
    ;[state] = lassoTool.reduce(state, { type, at: p }, ctx)
  }
  return lassoTool.reduce(state, { type: "pointerUp", at: at(0, 50) }, ctx)
}

describe("lassoTool", () => {
  it("records the path while dragging", () => {
    const [state] = lassoTool.reduce(
      lassoTool.initial,
      { type: "pointerDown", at: at(1, 2) },
      makeCtx(),
    )
    expect(state).toEqual({ phase: "drawing", points: [at(1, 2)] })
  })

  it("selects only enclosed, unlocked elements, then returns to the selection tool", () => {
    const [state, effects] = drag()
    expect(state).toBe(lassoTool.initial)
    expect(effects).toEqual([
      { kind: "select", ids: [small.id] },
      { kind: "switchTool", tool: "selection" },
    ])
  })

  it("with shift, adds to the existing selection", () => {
    const ctx = makeCtx({
      readElements: () => [small, far],
      selectedIds: [far.id],
      modifiers: { ...NO_MODIFIERS, shift: true },
    })
    const [, effects] = drag(ctx)
    expect(effects[0]).toEqual({ kind: "select", ids: [far.id, small.id] })
  })

  it("escape abandons the lasso without selecting", () => {
    const [drawing] = lassoTool.reduce(
      lassoTool.initial,
      { type: "pointerDown", at: at(0, 0) },
      makeCtx(),
    )
    const [state, effects] = lassoTool.reduce(drawing, { type: "escape" }, makeCtx())
    expect(state).toBe(lassoTool.initial)
    expect(effects).toEqual([{ kind: "switchTool", tool: "selection" }])
  })
})
