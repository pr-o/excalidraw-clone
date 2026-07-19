import { newRectangle, newText, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { attachShortcuts } from "../src/keyboard/shortcuts"
import { useAppStore } from "../src/store"

describe("keyboard shortcuts", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachShortcuts({ scene })
    useAppStore.getState().setActiveTool("selection")
    useAppStore.getState().setSelection([])
    useAppStore.getState().setPaletteOpen(false)
    useAppStore.getState().setOpenDialog(null)
  })
  afterEach(() => detach())

  it("'r' switches to rectangle tool", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }))
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("Cmd+/ opens command palette", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true }))
    expect(useAppStore.getState().paletteOpen).toBe(true)
  })

  it("Escape clears selection", () => {
    useAppStore.getState().setSelection(["a"])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("'?' opens help dialog", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))
    expect(useAppStore.getState().openDialog).toBe("help")
  })

  it("Ctrl+Shift+L locks the selection and clears it", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }))
    expect(scene.getElements()[0]!.locked).toBe(true)
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("Ctrl+Shift+L with empty selection is a no-op", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }))
    expect(scene.getElements()[0]!.locked).toBe(false)
  })

  it("Ctrl+A selects all unlocked elements, skipping bound labels", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const locked = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), locked: true }
    const label = { ...newText({ x: 2, y: 2, text: "hi" }), containerId: r.id }
    scene.mutate((draft) => {
      draft.push(r, locked, label)
    })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }))
    expect(useAppStore.getState().selectedIds).toEqual([r.id])
  })

  it("ArrowRight nudges the selection by 1px; Shift+ArrowDown by 10px", () => {
    const r = newRectangle({ x: 5, y: 5, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    expect(scene.getElements()[0]!.x).toBe(6)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }))
    expect(scene.getElements()[0]!.y).toBe(15)
  })

  it("arrow keys with empty selection leave the scene untouched", () => {
    const r = newRectangle({ x: 5, y: 5, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))
    expect(scene.getElements()[0]!.x).toBe(5)
  })
})
