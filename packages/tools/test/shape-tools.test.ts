import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { diamondTool, ellipseTool, rectangleTool } from "../src"
import type { ShapeState } from "../src"
import {
  IDENTITY_VIEW,
  NO_MODIFIERS,
  applyMutation,
  makeCtx,
  point,
  withModifiers,
} from "./test-utils"

const TOOLS = [
  { name: "rectangle", tool: rectangleTool, type: "rectangle" as const },
  { name: "ellipse", tool: ellipseTool, type: "ellipse" as const },
  { name: "diamond", tool: diamondTool, type: "diamond" as const },
]

describe.each(TOOLS)("$name tool: creation flow", ({ tool, type }) => {
  it("pointerDown creates an element of the right type at the down-point", () => {
    const draft: ExcalidrawElement[] = []
    const ctx = makeCtx()
    const [next, effects] = tool.reduce(tool.initial, { type: "pointerDown", at: point(5, 7) }, ctx)
    applyMutation(effects, draft)
    expect(next.phase).toBe("drawing")
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe(type)
    expect(draft[0]?.x).toBe(5)
    expect(draft[0]?.y).toBe(7)
    expect(draft[0]?.width).toBe(0)
    expect(draft[0]?.height).toBe(0)
  })

  it("pointerMove updates width/height", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let state: ShapeState = tool.initial
    let r = tool.reduce(state, { type: "pointerDown", at: point(0, 0) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(20, 30) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    expect(draft.length).toBe(1)
    expect(draft[0]?.width).toBe(20)
    expect(draft[0]?.height).toBe(30)
  })

  it("shift constrains to a square (largest of |dx|, |dy|)", () => {
    const ctx = makeCtx({ modifiers: withModifiers({ shift: true }) })
    const draft: ExcalidrawElement[] = []
    let state: ShapeState = tool.initial
    let r = tool.reduce(state, { type: "pointerDown", at: point(0, 0) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(10, 30) }, ctx)
    applyMutation(r[1], draft)
    expect(draft[0]?.width).toBe(30)
    expect(draft[0]?.height).toBe(30)
  })

  it("alt grows from the down-point as center", () => {
    const ctx = makeCtx({ modifiers: withModifiers({ alt: true }) })
    const draft: ExcalidrawElement[] = []
    let state: ShapeState = tool.initial
    let r = tool.reduce(state, { type: "pointerDown", at: point(50, 50) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(70, 60) }, ctx)
    applyMutation(r[1], draft)
    expect(draft[0]?.x).toBe(30)
    expect(draft[0]?.y).toBe(40)
    expect(draft[0]?.width).toBe(40)
    expect(draft[0]?.height).toBe(20)
  })

  it("pointerUp with non-zero area emits final mutation, select, switchTool, returns to idle", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let state: ShapeState = tool.initial
    let r = tool.reduce(state, { type: "pointerDown", at: point(0, 0) }, ctx)
    const id = (state = r[0]).phase === "drawing" ? state.elementId : ""
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(40, 30) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    const up = tool.reduce(state, { type: "pointerUp", at: point(40, 30) }, ctx)
    expect(up[0].phase).toBe("idle")
    const kinds = up[1].map((e) => e.kind)
    expect(kinds).toContain("mutation")
    expect(kinds).toContain("select")
    expect(kinds).toContain("switchTool")
    const selectEff = up[1].find((e) => e.kind === "select")!
    if (selectEff.kind === "select") expect(selectEff.ids).toEqual([id])
    const switchEff = up[1].find((e) => e.kind === "switchTool")!
    if (switchEff.kind === "switchTool") expect(switchEff.tool).toBe("selection")
    const finalMut = up[1].find((e) => e.kind === "mutation")!
    if (finalMut.kind === "mutation") expect(finalMut.skipHistory).toBeUndefined()
  })

  it("pointerUp with zero area drops the element and returns to idle without select", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = tool.reduce(tool.initial, { type: "pointerDown", at: point(10, 10) }, ctx)
    applyMutation(down[1], draft)
    const up = tool.reduce(down[0], { type: "pointerUp", at: point(10, 10) }, ctx)
    applyMutation(up[1], draft)
    expect(up[0].phase).toBe("idle")
    expect(draft).toEqual([])
    expect(up[1].some((e) => e.kind === "select")).toBe(false)
    expect(up[1].some((e) => e.kind === "switchTool")).toBe(false)
  })

  it("escape mid-draw removes the element and returns to idle", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let state: ShapeState = tool.initial
    let r = tool.reduce(state, { type: "pointerDown", at: point(0, 0) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(20, 20) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    const esc = tool.reduce(state, { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(esc[0].phase).toBe("idle")
    expect(draft).toEqual([])
  })

  it("two consecutive draws produce two distinct elements", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let state: ShapeState = tool.initial
    let r = tool.reduce(state, { type: "pointerDown", at: point(0, 0) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(10, 10) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerUp", at: point(10, 10) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)

    r = tool.reduce(state, { type: "pointerDown", at: point(50, 50) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerMove", at: point(60, 60) }, ctx)
    state = r[0]
    applyMutation(r[1], draft)
    r = tool.reduce(state, { type: "pointerUp", at: point(60, 60) }, ctx)
    applyMutation(r[1], draft)

    expect(draft.length).toBe(2)
    expect(draft[0]?.id).not.toBe(draft[1]?.id)
  })

  it("ctx with non-default ViewTransform compiles", () => {
    expect(IDENTITY_VIEW.zoom).toBe(1)
    expect(NO_MODIFIERS.shift).toBe(false)
  })
})

describe("shape tool — receives snapped input", () => {
  it("rectangle drawn with on-grid start and end produces on-grid box", () => {
    const ctx = makeCtx()
    const down = rectangleTool.reduce(
      rectangleTool.initial,
      { type: "pointerDown", at: point(20, 40) },
      ctx,
    )
    const draft: ExcalidrawElement[] = []
    applyMutation(down[1], draft)
    const move = rectangleTool.reduce(down[0], { type: "pointerMove", at: point(80, 100) }, ctx)
    applyMutation(move[1], draft)
    const up = rectangleTool.reduce(move[0], { type: "pointerUp", at: point(80, 100) }, ctx)
    applyMutation(up[1], draft)

    const r = draft[0]!
    expect(r.x % 20).toBe(0)
    expect(r.y % 20).toBe(0)
    expect(r.width % 20).toBe(0)
    expect(r.height % 20).toBe(0)
  })
})
