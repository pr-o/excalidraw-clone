import { Scene, newRectangle, newText, type ExcalidrawTextElement } from "@excalidraw-clone/scene"
import type { ToolEffect } from "@excalidraw-clone/tools"
import { describe, expect, it, vi } from "vitest"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"
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

  it("laserMove effect forwards the point to the laser sink and never mutates the scene", () => {
    const scene = new Scene()
    const spy = vi.spyOn(scene, "mutate")
    const push = vi.fn()
    applyEffects(scene, [{ kind: "laserMove", at: { x: 3, y: 4 } }], { push })
    expect(push).toHaveBeenCalledWith({ x: 3, y: 4 })
    expect(spy).not.toHaveBeenCalled()
  })

  it("setGuides effect updates the guides slice", () => {
    const scene = new Scene()
    const guides = [{ axis: "y" as const, position: 5, start: 0, end: 10 }]
    applyEffects(scene, [{ kind: "setGuides", guides }])
    expect(useAppStore.getState().activeGuides).toEqual(guides)
  })
})

describe("applyEffects — fixed-width text reflow", () => {
  const withCanvas = (fn: () => void): void => {
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
    try {
      fn()
    } finally {
      spy.mockRestore()
    }
  }
  const setWidth = (id: string, patch: Partial<ExcalidrawTextElement>): ToolEffect => ({
    kind: "mutation",
    apply: (draft) => {
      const i = draft.findIndex((e) => e.id === id)
      draft[i] = { ...draft[i]!, ...patch } as ExcalidrawTextElement
    },
  })

  it("re-wraps the height when a fixed-width text's width changes", () => {
    withCanvas(() => {
      const t = {
        ...newText({ x: 0, y: 0, text: "hello world", fontSize: 20 }),
        width: 110,
        height: 25,
      }
      const scene = new Scene([t])
      applyEffects(scene, [setWidth(t.id, { width: 60, autoResize: false })])
      const out = scene.getElements()[0] as ExcalidrawTextElement
      expect(out.width).toBe(60)
      expect(out.height).toBe(50)
    })
  })

  it("re-measures the natural width when autoResize is turned back on", () => {
    withCanvas(() => {
      const t = {
        ...newText({ x: 0, y: 0, text: "hello world", fontSize: 20 }),
        width: 60,
        height: 50,
        autoResize: false,
      }
      const scene = new Scene([t])
      applyEffects(scene, [setWidth(t.id, { autoResize: true })])
      const out = scene.getElements()[0] as ExcalidrawTextElement
      expect(out.width).toBe(110)
      expect(out.height).toBe(25)
    })
  })

  it("leaves auto-resizing text box changes (corner resize) alone", () => {
    withCanvas(() => {
      const t = {
        ...newText({ x: 0, y: 0, text: "hello world", fontSize: 20 }),
        width: 110,
        height: 25,
      }
      const scene = new Scene([t])
      applyEffects(scene, [setWidth(t.id, { width: 200, height: 80 })])
      const out = scene.getElements()[0] as ExcalidrawTextElement
      expect(out.width).toBe(200)
      expect(out.height).toBe(80)
    })
  })
})
