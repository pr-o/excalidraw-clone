import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { noteTool } from "../src"
import type { NoteState } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("note tool", () => {
  it("pointerDown creates a container + bound text and enters drawing", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const [state, effects] = noteTool.reduce(
      noteTool.initial,
      { type: "pointerDown", at: point(10, 20) },
      ctx,
    )
    applyMutation(effects, draft)
    expect(state.phase).toBe("drawing")
    expect(draft.length).toBe(2)
    const container = draft.find((e) => e.type === "rectangle")!
    const text = draft.find((e) => e.type === "text")!
    expect(container.boundElements).toEqual([{ id: text.id, type: "text" }])
  })

  it("pointerUp with a non-zero box selects the container, switches to selection, and edits the text", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    let r = noteTool.reduce(noteTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    r = noteTool.reduce(r[0], { type: "pointerMove", at: point(60, 40) }, ctx)
    applyMutation(r[1], draft)
    const up = noteTool.reduce(r[0], { type: "pointerUp", at: point(60, 40) }, ctx)
    applyMutation(up[1], draft)
    const container = draft.find((e) => e.type === "rectangle")!
    const text = draft.find((e) => e.type === "text")!
    expect(up[0].phase).toBe("idle")
    expect(up[1].find((e) => e.kind === "select")).toEqual({ kind: "select", ids: [container.id] })
    expect(up[1].find((e) => e.kind === "switchTool")).toEqual({
      kind: "switchTool",
      tool: "selection",
    })
    const edit = up[1].find((e) => e.kind === "startTextEdit")
    expect(edit).toEqual({ kind: "startTextEdit", elementId: text.id })
  })

  it("pointerUp with a zero-size box discards both elements", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = noteTool.reduce(noteTool.initial, { type: "pointerDown", at: point(5, 5) }, ctx)
    applyMutation(r[1], draft)
    const up = noteTool.reduce(r[0], { type: "pointerUp", at: point(5, 5) }, ctx)
    applyMutation(up[1], draft)
    expect(draft.length).toBe(0)
    expect(up[1].some((e) => e.kind === "startTextEdit")).toBe(false)
  })

  it("escape during drawing discards both elements", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const r = noteTool.reduce(noteTool.initial, { type: "pointerDown", at: point(0, 0) }, ctx)
    applyMutation(r[1], draft)
    const esc = noteTool.reduce(r[0], { type: "escape" }, ctx)
    applyMutation(esc[1], draft)
    expect(draft.length).toBe(0)
    expect(esc[0].phase).toBe("idle")
  })
})

// reference NoteState so the type import is exercised
const _state: NoteState = { phase: "idle" }
void _state
