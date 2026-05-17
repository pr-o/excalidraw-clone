import { Scene, newRectangle } from "@excalidraw-clone/scene"
import type { ToolEffect } from "@excalidraw-clone/tools"
import { describe, expect, it, vi } from "vitest"
import { applyEffects } from "../src/driver/effects"
import { useAppStore } from "../src/store"

describe("applyEffects", () => {
  it("mutation effect calls scene.mutate", () => {
    const scene = new Scene()
    const effect: ToolEffect = {
      kind: "mutation",
      apply: (draft) => draft.push(newRectangle({ x: 0, y: 0, width: 10, height: 10 })),
    }
    applyEffects(scene, [effect])
    expect(scene.getElements().length).toBe(1)
  })

  it("select effect updates the selection slice", () => {
    const scene = new Scene()
    useAppStore.getState().setSelection([])
    applyEffects(scene, [{ kind: "select", ids: ["x"] }])
    expect(useAppStore.getState().selectedIds).toEqual(["x"])
  })

  it("addToSelection effect adds without replacing", () => {
    const scene = new Scene()
    useAppStore.getState().setSelection(["a"])
    applyEffects(scene, [{ kind: "addToSelection", ids: ["b"] }])
    expect([...useAppStore.getState().selectedIds].sort()).toEqual(["a", "b"])
  })

  it("switchTool effect updates active tool and resets reducer state", () => {
    const scene = new Scene()
    useAppStore.getState().setActiveTool("rectangle")
    useAppStore.getState().setToolState("rectangle", { phase: "drawing" })
    applyEffects(scene, [{ kind: "switchTool", tool: "selection" }])
    expect(useAppStore.getState().activeTool).toBe("selection")
    expect(useAppStore.getState().toolStates.rectangle).toBeUndefined()
  })

  it("skipHistory mutation calls scene.mutate with skipHistory", () => {
    const scene = new Scene()
    const spy = vi.spyOn(scene, "mutate")
    applyEffects(scene, [{ kind: "mutation", apply: () => {}, skipHistory: true }])
    expect(spy).toHaveBeenCalledWith(expect.any(Function), { skipHistory: true })
  })
})
