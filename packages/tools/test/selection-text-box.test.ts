import {
  newText,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

const setup = (overrides: Partial<ExcalidrawTextElement> = {}) => {
  const t = { ...newText({ x: 0, y: 0, width: 100, height: 20, text: "a b c" }), ...overrides }
  const draft: ExcalidrawElement[] = [t]
  const ctx = makeCtx({ readElements: () => draft, hitTest: () => t, selectedIds: [t.id] })
  return { t, draft, ctx }
}

const text = (draft: ExcalidrawElement[]) => draft[0] as ExcalidrawTextElement

describe("selection — fixed-width text box", () => {
  it("east-handle resize of free text fixes its width (autoResize false)", () => {
    const { draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(100, 10) },
      ctx,
    )
    expect(s[0].phase).toBe("resizing")
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(60, 10) }, ctx)
    applyMutation(s[1], draft)
    expect(text(draft).width).toBe(60)
    expect(text(draft).autoResize).toBe(false)
  })

  it("west-handle resize also fixes the width", () => {
    const { draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(0, 10) },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(30, 10) }, ctx)
    applyMutation(s[1], draft)
    expect(text(draft).x).toBe(30)
    expect(text(draft).autoResize).toBe(false)
  })

  it("corner-handle resize leaves autoResize untouched", () => {
    const { draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(100, 20) },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(150, 40) }, ctx)
    applyMutation(s[1], draft)
    expect(text(draft).autoResize).toBe(true)
  })

  it("escape restores autoResize", () => {
    const { draft, ctx } = setup()
    let s = selectionTool.reduce(
      selectionTool.initial,
      { type: "pointerDown", at: point(100, 10) },
      ctx,
    )
    s = selectionTool.reduce(s[0], { type: "pointerMove", at: point(60, 10) }, ctx)
    applyMutation(s[1], draft)
    s = selectionTool.reduce(s[0], { type: "escape" }, ctx)
    applyMutation(s[1], draft)
    expect(text(draft).autoResize).toBe(true)
    expect(text(draft).width).toBe(100)
  })

  it("double-click on a resize handle of fixed-width text restores autoResize", () => {
    const { draft, ctx } = setup({ autoResize: false })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(100, 10) },
      ctx,
    )
    expect(effects.some((e) => e.kind === "startTextEdit")).toBe(false)
    applyMutation(effects, draft)
    expect(text(draft).autoResize).toBe(true)
  })

  it("double-click on an auto-resizing text's handle still starts editing", () => {
    const { ctx } = setup()
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(100, 10) },
      ctx,
    )
    expect(effects.some((e) => e.kind === "startTextEdit")).toBe(true)
  })
})
