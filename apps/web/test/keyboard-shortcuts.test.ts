import {
  sceneToViewport,
  viewportToScene,
  ZOOM_MAX,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import { newRectangle, newText, newTriangle, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

  it("'5' switches to pentagon tool", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }))
    expect(useAppStore.getState().activeTool).toBe("pentagon")
  })

  it("'8' switches to octagon tool", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "8" }))
    expect(useAppStore.getState().activeTool).toBe("octagon")
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

  it("Cmd+K opens the link editor for a single selected unlocked element", () => {
    useAppStore.getState().setLinkEditorElementId(null)
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
    expect(useAppStore.getState().linkEditorElementId).toBe(r.id)
  })

  it("Cmd+K with a multi-selection is a no-op", () => {
    useAppStore.getState().setLinkEditorElementId(null)
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(a, b)
    })
    useAppStore.getState().setSelection([a.id, b.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("Cmd+K on a locked element is a no-op", () => {
    useAppStore.getState().setLinkEditorElementId(null)
    const r = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
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

  it("Shift+H flips the selection across the x-axis", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((draft) => {
      draft.push(tri)
    })
    useAppStore.getState().setSelection([tri.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "H", shiftKey: true }))
    expect(scene.getElements()[0]!.mirror).toEqual([-1, 1])
  })

  it("Shift+V with a non-empty selection flips and does NOT switch to the selection tool", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((draft) => {
      draft.push(tri)
    })
    useAppStore.getState().setSelection([tri.id])
    useAppStore.getState().setActiveTool("rectangle")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "V", shiftKey: true }))
    expect(scene.getElements()[0]!.mirror).toEqual([1, -1])
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("Shift+V with an empty selection is a no-op", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((draft) => {
      draft.push(tri)
    })
    useAppStore.getState().setActiveTool("rectangle")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "V", shiftKey: true }))
    expect(scene.getElements()[0]!.mirror).toBeUndefined()
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("Shift+H over a multi-selection reflects each member across the combined bounds", () => {
    const a = newTriangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newTriangle({ x: 90, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(a, b)
    })
    useAppStore.getState().setSelection([a.id, b.id])
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "H", shiftKey: true }))
    const els = scene.getElements()
    expect(els.find((e) => e.id === a.id)!.x).toBe(90)
    expect(els.find((e) => e.id === b.id)!.x).toBe(0)
    expect(els[0]!.mirror).toEqual([-1, 1])
  })

  it("Alt+PageDown calls onNextPage when provided", () => {
    detach()
    const onNextPage = vi.fn()
    detach = attachShortcuts({ scene, onNextPage })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", altKey: true }))
    expect(onNextPage).toHaveBeenCalledTimes(1)
  })

  it("Alt+PageUp calls onPrevPage when provided", () => {
    detach()
    const onPrevPage = vi.fn()
    detach = attachShortcuts({ scene, onPrevPage })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", altKey: true }))
    expect(onPrevPage).toHaveBeenCalledTimes(1)
  })

  it("Alt+PageDown without a handler does not throw", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", altKey: true }))
  })
})

describe("presentation mode read-only guard", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachShortcuts({ scene })
    useAppStore.getState().setActiveTool("selection")
    useAppStore.getState().setSelection([])
  })
  afterEach(() => {
    detach()
    useAppStore.getState().exitPresentation()
  })

  it("ignores all editor shortcuts while presenting", () => {
    // A committed mutation gives `undo` something to actually undo, so a
    // leaked Cmd+Z would be observable as the element disappearing.
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    expect(scene.canUndo()).toBe(true)

    useAppStore.getState().enterPresentation()

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }))
    expect(useAppStore.getState().activeTool).toBe("selection")

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }))
    expect(scene.getElements().map((e) => e.id)).toEqual([r.id])
  })

  it("resumes handling shortcuts after exitPresentation", () => {
    useAppStore.getState().enterPresentation()
    useAppStore.getState().exitPresentation()
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }))
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })
})

describe("zoom keyboard shortcuts", () => {
  let detach: () => void
  beforeEach(() => {
    detach = attachShortcuts({ scene: new Scene() })
  })
  afterEach(() => detach())

  it("Ctrl+0 resets zoom to 100%, keeping the viewport-center scene point fixed", () => {
    const before: ViewTransform = { scrollX: 40, scrollY: -20, zoom: 2 }
    useAppStore.getState().setView(before)
    const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const scenePointBefore = viewportToScene(anchor, before)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", ctrlKey: true }))
    const after = useAppStore.getState()
    expect(after.zoom).toBe(1)
    const back = sceneToViewport(scenePointBefore, {
      scrollX: after.scrollX,
      scrollY: after.scrollY,
      zoom: after.zoom,
    })
    expect(back.x).toBeCloseTo(anchor.x)
    expect(back.y).toBeCloseTo(anchor.y)
  })

  it("Ctrl++ zooms in by one step", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true }))
    expect(useAppStore.getState().zoom).toBeCloseTo(1.1)
  })

  it("Ctrl+- zooms out by one step", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", ctrlKey: true }))
    expect(useAppStore.getState().zoom).toBeCloseTo(1 / 1.1)
  })

  it("Ctrl++ respects ZOOM_MAX", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: ZOOM_MAX })
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true }))
    expect(useAppStore.getState().zoom).toBe(ZOOM_MAX)
  })
})

// The style clipboard is module-level in shortcuts.ts (it must survive the
// re-attach that a page switch triggers), so these tests run in declaration
// order: the "before any copy" case has to come first, while it is still null.
describe("style clipboard shortcuts", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachShortcuts({ scene })
    useAppStore.getState().setSelection([])
  })
  afterEach(() => detach())

  const copy = (): void => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, altKey: true }))
  }
  const paste = (): void => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, altKey: true }))
  }

  it("Ctrl+Alt+V before anything was copied leaves the scene untouched", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10, strokeColor: "#0000ff" })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    paste()
    expect(scene.getElements()[0]!.strokeColor).toBe("#0000ff")
  })

  it("Ctrl+Alt+C then Ctrl+Alt+V copies the style, leaving geometry untouched", () => {
    const source = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10, strokeColor: "#ff0000" }),
      strokeStyle: "dashed" as const,
      opacity: 30,
    }
    const target = newRectangle({ x: 200, y: 150, width: 60, height: 40 })
    scene.mutate((draft) => {
      draft.push(source, target)
    })

    useAppStore.getState().setSelection([source.id])
    copy()
    useAppStore.getState().setSelection([target.id])
    paste()

    const next = scene.getElements().find((e) => e.id === target.id)!
    expect(next.strokeColor).toBe("#ff0000")
    expect(next.strokeStyle).toBe("dashed")
    expect(next.opacity).toBe(30)
    expect({ x: next.x, y: next.y, width: next.width, height: next.height }).toEqual({
      x: 200,
      y: 150,
      width: 60,
      height: 40,
    })
    // the source is untouched
    expect(scene.getElements().find((e) => e.id === source.id)!.x).toBe(0)
  })

  it("Ctrl+Alt+V restyles every selected element", () => {
    const source = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), opacity: 55 }
    const a = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    const b = newTriangle({ x: 90, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(source, a, b)
    })
    useAppStore.getState().setSelection([source.id])
    copy()
    useAppStore.getState().setSelection([a.id, b.id])
    paste()
    const els = scene.getElements()
    expect(els.find((e) => e.id === a.id)!.opacity).toBe(55)
    expect(els.find((e) => e.id === b.id)!.opacity).toBe(55)
  })

  it("Ctrl+Alt+C with nothing selected keeps the previously copied style", () => {
    const source = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), opacity: 22 }
    const target = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(source, target)
    })
    useAppStore.getState().setSelection([source.id])
    copy()
    useAppStore.getState().setSelection([])
    copy()
    useAppStore.getState().setSelection([target.id])
    paste()
    expect(scene.getElements().find((e) => e.id === target.id)!.opacity).toBe(22)
  })

  it("Ctrl+Alt+V does not fall through to the selection tool", () => {
    useAppStore.getState().setActiveTool("rectangle")
    paste()
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })
})
