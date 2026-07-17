import {
  newDiamond,
  newHexagon,
  newLine,
  newRectangle,
  newText,
  type ExcalidrawElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { selectionTool } from "../src"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("selection — double click", () => {
  it("double-click on a text element emits startTextEdit", () => {
    const t = newText({ x: 0, y: 0, text: "hi" })
    const ctx = makeCtx({ readElements: () => [t], hitTest: () => t })
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    const eff = r[1].find((e) => e.kind === "startTextEdit")
    expect(eff).toBeDefined()
    if (eff?.kind === "startTextEdit") expect(eff.elementId).toBe(t.id)
  })

  it("double-click on a non-labelable element is a no-op", () => {
    const l = newLine({ x: 0, y: 0, width: 10, height: 10 })
    const ctx = makeCtx({ hitTest: () => l })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    expect(out[1]).toEqual([])
  })

  it("double-click on empty space is a no-op", () => {
    const ctx = makeCtx({ hitTest: () => null })
    const out = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    expect(out[1]).toEqual([])
  })

  it("double-click on a note container emits startTextEdit for its bound text", () => {
    const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
    const container = {
      ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
      id: "C",
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    const ctx = makeCtx({ readElements: () => [container, text], hitTest: () => container })
    const r = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(5, 5) },
      ctx,
    )
    const eff = r[1].find((e) => e.kind === "startTextEdit")
    expect(eff).toBeDefined()
    if (eff?.kind === "startTextEdit") expect(eff.elementId).toBe(text.id)
  })

  it("double-click on a bare shape creates a bound label and starts editing", () => {
    const hexagon = newHexagon({ x: 0, y: 0, width: 100, height: 80 })
    const ctx = makeCtx({ readElements: () => [hexagon], hitTest: () => hexagon })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(50, 40) },
      ctx,
    )
    const draft: ExcalidrawElement[] = [hexagon]
    applyMutation([...effects], draft)

    const label = draft.find((e) => e.type === "text")
    expect(label).toBeDefined()
    expect(label!.containerId).toBe(hexagon.id)
    const container = draft.find((e) => e.id === hexagon.id)!
    expect(container.boundElements).toEqual([{ id: label!.id, type: "text" }])

    const edit = effects.find((e) => e.kind === "startTextEdit")
    expect(edit && edit.kind === "startTextEdit" && edit.elementId).toBe(label!.id)
    // creation is skipHistory so the later text commit records one undo step
    const mut = effects.find((e) => e.kind === "mutation")
    expect(mut && mut.kind === "mutation" && mut.skipHistory).toBe(true)
  })

  it("double-click on a shape that already has a label reuses it", () => {
    const text = newText({ x: 0, y: 0, text: "hi", containerId: "D" })
    const diamond = {
      ...newDiamond({ x: 0, y: 0, width: 100, height: 80 }),
      id: "D",
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    const ctx = makeCtx({ readElements: () => [diamond, text], hitTest: () => diamond })
    const [, effects] = selectionTool.reduce(
      selectionTool.initial,
      { type: "doubleClick", at: point(50, 40) },
      ctx,
    )
    const edit = effects.find((e) => e.kind === "startTextEdit")
    expect(edit && edit.kind === "startTextEdit" && edit.elementId).toBe(text.id)
    expect(effects.some((e) => e.kind === "mutation")).toBe(false)
  })
})
