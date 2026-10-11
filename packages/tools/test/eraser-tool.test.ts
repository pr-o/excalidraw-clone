import {
  type ExcalidrawElement,
  Scene,
  newArrow,
  newFrame,
  newLine,
  newRectangle,
  newText,
} from "@excalidraw-clone/scene"
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

  it("sweeping a frame's interior keeps the frame; crossing its border erases it", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    expect(drag([frame], [point(100, 100), point(150, 100)]).isDeleted(frame.id)).toBe(false)
    expect(drag([frame], [point(100, 100), point(198, 100)]).isDeleted(frame.id)).toBe(true)
  })

  it("the frame border band is FRAME_EDGE_PX screen px, so it narrows in world units at zoom 2", () => {
    const frame = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const zoomed = makeCtx({
      readElements: () => [frame],
      viewTransform: { scrollX: 0, scrollY: 0, zoom: 2 },
    })
    const at = (x: number) =>
      eraserTool.reduce(eraserTool.initial, { type: "pointerDown", at: point(x, 100) }, zoomed)[1]
    // 6 screen px = 3 world units at zoom 2: x=196 (4 inside) misses, x=198 (2 inside) hits.
    expect(at(196)).toEqual([])
    expect(at(198)).toHaveLength(1)
  })

  it("a pointerDown while a stale erasing state lingers starts fresh, not from the old trail", () => {
    const between = rect(50) // sits on the stale segment from (5,5) to (100,5)
    const ctx = makeCtx({ readElements: () => [between] })
    const stale: EraserState = { phase: "erasing", before: [], erasedIds: [], trail: [point(5, 5)] }
    const [state, down] = eraserTool.reduce(stale, { type: "pointerDown", at: point(100, 5) }, ctx)
    const [, move] = eraserTool.reduce(state, { type: "pointerMove", at: point(101, 5) }, ctx)
    expect([...down, ...move]).toEqual([])
    expect(state.phase === "erasing" && state.trail).toEqual([point(100, 5)])
  })
})

const run = (scene: Scene, effects: Effects): void => {
  for (const e of effects) {
    if (e.kind === "mutation")
      scene.mutate(e.apply, e.skipHistory ? { skipHistory: true } : undefined)
  }
}

describe("eraser tool against a real Scene", () => {
  it("escape restores an erased shape together with its label and arrow binding", () => {
    const base = newRectangle({ x: 0, y: 0, width: 40, height: 40 })
    const label = newText({ x: 0, y: 0, text: "hi", containerId: base.id })
    const arrow = {
      ...newArrow({ x: 100, y: 20 }),
      points: [point(0, 0), point(-56, 0)],
      endBinding: { elementId: base.id, focus: 0, gap: 4 },
    }
    const box = {
      ...base,
      boundElements: [
        { id: label.id, type: "text" as const },
        { id: arrow.id, type: "arrow" as const },
      ],
    }
    const scene = new Scene([box, label, arrow])
    const ctx = makeCtx({ readElements: () => scene.getElements() })
    const get = (id: string) => scene.getElementsIncludingDeleted().find((e) => e.id === id)!

    const [erasing, down] = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(20, 20) },
      ctx,
    )
    run(scene, down)
    // Same side effects as the Delete key: label cascades, arrow survives unbound.
    expect(get(label.id).isDeleted).toBe(true)
    expect(get(arrow.id).isDeleted).toBe(false)
    const unbound = get(arrow.id)
    expect(unbound.type === "arrow" ? unbound.endBinding : "not an arrow").toBeNull()

    const [, esc] = eraserTool.reduce(erasing, { type: "escape" }, ctx)
    run(scene, esc)
    expect(get(box.id).isDeleted).toBe(false)
    expect(get(label.id).isDeleted).toBe(false)
    const rebound = get(arrow.id)
    expect(rebound.type === "arrow" ? rebound.endBinding?.elementId : null).toBe(box.id)
  })

  it("a whole drag is one undo step", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 100, y: 0, width: 10, height: 10 })
    const scene = new Scene([a, b])
    const ctx = makeCtx({ readElements: () => scene.getElements() })
    let [state, effects] = eraserTool.reduce(
      eraserTool.initial,
      { type: "pointerDown", at: point(5, 5) },
      ctx,
    )
    run(scene, effects)
    ;[state, effects] = eraserTool.reduce(state, { type: "pointerMove", at: point(105, 5) }, ctx)
    run(scene, effects)
    ;[, effects] = eraserTool.reduce(state, { type: "pointerUp", at: point(105, 5) }, ctx)
    run(scene, effects)
    expect(scene.getElements()).toHaveLength(0)
    scene.undo()
    expect(scene.getElements()).toHaveLength(2)
    expect(scene.canUndo()).toBe(false)
  })
})
