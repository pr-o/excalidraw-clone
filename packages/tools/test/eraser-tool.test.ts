import { type ExcalidrawElement, newLine, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { type EraserState, eraserTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

type Effects = ReturnType<typeof eraserTool.reduce>[1]

const rect = (x: number, extra: Partial<ExcalidrawElement> = {}): ExcalidrawElement =>
  ({ ...newRectangle({ x, y: 0, width: 10, height: 10 }), ...extra }) as ExcalidrawElement

/** Drive one drag through `path`, applying effects to a draft the way the scene
 *  would (readElements sees live elements only). Optionally end with pointerUp/escape. */
const drag = (
  elements: readonly ExcalidrawElement[],
  path: readonly { x: number; y: number }[],
  end: "pointerUp" | "escape" | null = null,
) => {
  const draft = [...elements]
  const ctx = makeCtx({ readElements: () => draft.filter((e) => !e.isDeleted) })
  let state: EraserState = eraserTool.initial
  let effects: Effects = []
  for (const at of path) {
    const type = state.phase === "idle" ? "pointerDown" : "pointerMove"
    ;[state, effects] = eraserTool.reduce(state, { type, at }, ctx)
    applyMutation(effects, draft)
  }
  if (end) {
    const event =
      end === "escape" ? ({ type: "escape" } as const) : { type: end, at: path[path.length - 1]! }
    ;[state, effects] = eraserTool.reduce(state, event, ctx)
    applyMutation(effects, draft)
  }
  const isDeleted = (id: string) => draft.find((e) => e.id === id)?.isDeleted
  return { state, effects, isDeleted }
}

describe("eraser tool", () => {
  it("pointerDown over an element soft-deletes it live, outside history", () => {
    const r = rect(0)
    const { effects, isDeleted } = drag([r], [point(5, 5)])
    expect(isDeleted(r.id)).toBe(true)
    expect(effects).toMatchObject([{ kind: "mutation", skipHistory: true }])
  })

  it("a fast straight drag erases a thin line it jumps across", () => {
    const line = { ...newLine({ x: 50, y: 0 }), points: [point(0, 0), point(0, 100)] }
    const { isDeleted } = drag([line], [point(0, 50), point(100, 50)])
    expect(isDeleted(line.id)).toBe(true)
  })

  it("erases every element under the path, not just the topmost", () => {
    const below = rect(0)
    const above = rect(0)
    const { isDeleted } = drag([below, above], [point(5, 5)])
    expect(isDeleted(below.id)).toBe(true)
    expect(isDeleted(above.id)).toBe(true)
  })

  it("skips locked elements and bound labels", () => {
    const locked = rect(0, { locked: true })
    const label = rect(0, { type: "text", containerId: "some-box" })
    const { isDeleted } = drag([locked, label], [point(5, 5)])
    expect(isDeleted(locked.id)).toBe(false)
    expect(isDeleted(label.id)).toBe(false)
  })

  it("erasing one group member erases the whole group, except locked members", () => {
    const hit = rect(0, { groupIds: ["g"] })
    const mate = rect(100, { groupIds: ["g"] })
    const lockedMate = rect(200, { groupIds: ["g"], locked: true })
    const { isDeleted } = drag([hit, mate, lockedMate], [point(5, 5)])
    expect(isDeleted(hit.id)).toBe(true)
    expect(isDeleted(mate.id)).toBe(true)
    expect(isDeleted(lockedMate.id)).toBe(false)
  })

  it("erases each element once", () => {
    const r = rect(0)
    const { state, effects } = drag([r], [point(5, 5), point(6, 6)])
    expect(effects).toEqual([])
    expect(state.phase === "erasing" && state.erasedIds).toEqual([r.id])
  })

  it("pointerUp commits one history-tracked mutation; an empty drag commits nothing", () => {
    const r = rect(0)
    const hit = drag([r], [point(5, 5)], "pointerUp")
    expect(hit.state.phase).toBe("idle")
    expect(hit.effects).toHaveLength(1)
    expect(hit.effects[0]).not.toHaveProperty("skipHistory")
    expect(drag([r], [point(50, 50)], "pointerUp").effects).toEqual([])
  })

  it("escape mid-erase brings back everything erased so far", () => {
    const r = rect(0)
    const { state, isDeleted } = drag([r], [point(5, 5)], "escape")
    expect(state.phase).toBe("idle")
    expect(isDeleted(r.id)).toBe(false)
  })
})
