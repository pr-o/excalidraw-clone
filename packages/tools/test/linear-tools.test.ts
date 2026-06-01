import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { arrowTool, lineTool } from "../src"
import type { LinearState } from "../src"
import { applyMutation, makeCtx, point, withModifiers } from "./test-utils"

const TOOLS = [
  { name: "line", tool: lineTool, type: "line" as const },
  { name: "arrow", tool: arrowTool, type: "arrow" as const },
]

describe.each(TOOLS)("$name tool: 2-point drawing", ({ tool, type }) => {
  it("pointerDown creates an element of the right type at the start point", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = tool.reduce(tool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    expect(r[0].phase).toBe("drawing")
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe(type)
  })

  it("pointerMove sets element x/y/width/height + relative points", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = tool.reduce(tool.initial, { type: "pointerDown", at: point(2, 3) }, ctx)
    applyMutation(down[1], draft)
    const move = tool.reduce(down[0], { type: "pointerMove", at: point(12, 8) }, ctx)
    applyMutation(move[1], draft)
    const e = draft[0] as ExcalidrawElement & { points?: { x: number; y: number }[] }
    expect(e.x).toBe(2)
    expect(e.y).toBe(3)
    expect(e.width).toBe(10)
    expect(e.height).toBe(5)
    expect(e.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ])
  })

  it("shift constrains to nearest 45° increment", () => {
    const ctx = makeCtx({ modifiers: withModifiers({ shift: true }) })
    const draft: ExcalidrawElement[] = []
    const down = tool.reduce(tool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    // 30° from origin: dx=cos(30°), dy=sin(30°). Shift snaps to 45°.
    const len = 100
    const target = {
      x: Math.cos((30 * Math.PI) / 180) * len,
      y: Math.sin((30 * Math.PI) / 180) * len,
    }
    const move = tool.reduce(down[0], { type: "pointerMove", at: target }, ctx)
    applyMutation(move[1], draft)
    const e = draft[0] as ExcalidrawElement & { points?: { x: number; y: number }[] }
    const tip = e.points?.[1]
    expect(tip).toBeDefined()
    if (!tip) return
    // After snapping, tip angle should be exactly 45°.
    const ang = Math.atan2(tip.y, tip.x)
    expect(Math.abs(ang - Math.PI / 4)).toBeLessThan(1e-9)
  })

  it("pointerUp with non-zero displacement emits final mutation + select + switchTool", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = tool.reduce(tool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const move = tool.reduce(down[0], { type: "pointerMove", at: point(50, 0) }, ctx)
    applyMutation(move[1], draft)
    const up = tool.reduce(move[0], { type: "pointerUp", at: point(50, 0) }, ctx)
    expect(up[0].phase).toBe("idle")
    const kinds = up[1].map((e) => e.kind)
    expect(kinds).toContain("select")
    expect(kinds).toContain("switchTool")
  })

  it("zero-length pointerUp drops the element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = tool.reduce(tool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const up = tool.reduce(down[0], { type: "pointerUp", at: point(0, 0) }, ctx)
    applyMutation(up[1], draft)
    expect(draft).toEqual([])
    expect(up[1].some((e) => e.kind === "select")).toBe(false)
  })

  it("escape removes the in-progress element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const down = tool.reduce(tool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    const move = tool.reduce(down[0], { type: "pointerMove", at: point(10, 0) }, ctx)
    applyMutation(move[1], draft)
    const esc = tool.reduce(move[0], { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(esc[0].phase).toBe("idle")
    expect(draft).toEqual([])
  })
})

describe("arrow defaults to endArrowhead 'arrow'", () => {
  it("creates an arrow element with endArrowhead set", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = arrowTool.reduce(arrowTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    const e = draft[0] as ExcalidrawElement & { endArrowhead?: string | null }
    expect(e.endArrowhead).toBe("arrow")
  })
})

describe("LinearState narrowing compiles", () => {
  it("idle state has no other fields", () => {
    const idle: LinearState = { phase: "idle" }
    expect(idle.phase).toBe("idle")
  })
})

describe("linear tool — shift wins over grid", () => {
  it("with shift held and on-grid endpoints, 45° constraint may pull the end off-grid", () => {
    const ctx = makeCtx({ modifiers: withModifiers({ shift: true }) })
    const draft: ExcalidrawElement[] = []
    const down = lineTool.reduce(lineTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(down[1], draft)
    // Pointer at (80, 20) — atan2(20, 80) ≈ 14°. Snapped to nearest 45° (0 rad).
    // constrainAngle keeps the original length (hypot ≈ 82.46), producing
    // an endpoint near (82.46, 0): y is on-grid, x is off-grid.
    const move = lineTool.reduce(down[0], { type: "pointerMove", at: point(80, 20) }, ctx)
    applyMutation(move[1], draft)
    const line = draft[0]!
    expect(line.height).toBeCloseTo(0, 5)
    expect(line.width).toBeGreaterThan(0)
    expect(line.width % 20).not.toBe(0)
  })
})
