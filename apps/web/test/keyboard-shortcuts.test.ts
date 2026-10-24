import {
  sceneToViewport,
  viewportToScene,
  ZOOM_MAX,
  type ViewTransform,
} from "@excalidraw-clone/geometry"
import {
  type ExcalidrawTextElement,
  newRectangle,
  newText,
  newTriangle,
  Scene,
} from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachShortcuts } from "../src/keyboard/shortcuts"
import { useAppStore } from "../src/store"
import { createFontAwareStubContext } from "./fontAwareCanvasStub"

const press = (init: KeyboardEventInit): void => {
  window.dispatchEvent(new KeyboardEvent("keydown", init))
}

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

  it("Shift+R toggles rulers without switching tool", () => {
    const before = useAppStore.getState().rulersVisible
    press({ key: "R", shiftKey: true })
    expect(useAppStore.getState().rulersVisible).toBe(!before)
    expect(useAppStore.getState().activeTool).toBe("selection")
    press({ key: "R", shiftKey: true })
    expect(useAppStore.getState().rulersVisible).toBe(before)
  })

  it("Alt+M toggles the minimap (code-matched, tool untouched, works in view mode)", () => {
    const before = useAppStore.getState().minimapVisible
    press({ key: "µ", code: "KeyM", altKey: true })
    expect(useAppStore.getState().minimapVisible).toBe(!before)
    expect(useAppStore.getState().activeTool).toBe("selection")
    useAppStore.getState().setViewMode(true)
    press({ key: "m", code: "KeyM", altKey: true })
    expect(useAppStore.getState().minimapVisible).toBe(before)
    useAppStore.getState().setViewMode(false)
  })

  it("Ctrl+D duplicates the selection and selects the copy, without picking a tool", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => {
      d.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    const n = scene.getElements().length
    press({ key: "d", ctrlKey: true })
    expect(scene.getElements().length).toBe(n + 1)
    expect(useAppStore.getState().selectedIds).not.toContain(r.id)
    expect(useAppStore.getState().activeTool).toBe("selection")
  })

  it("Ctrl+Shift+D opens the array-duplicate dialog for a selection, without picking a tool", () => {
    press({ key: "D", ctrlKey: true, shiftKey: true })
    expect(useAppStore.getState().openDialog).toBeNull()
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => {
      d.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    press({ key: "D", ctrlKey: true, shiftKey: true })
    expect(useAppStore.getState().openDialog).toBe("array-duplicate")
    expect(useAppStore.getState().activeTool).toBe("selection")
    useAppStore.getState().setOpenDialog(null)
    useAppStore.getState().setViewMode(true)
    press({ key: "D", ctrlKey: true, shiftKey: true })
    expect(useAppStore.getState().openDialog).toBeNull()
    useAppStore.getState().setViewMode(false)
  })

  it("'r' switches to rectangle tool", () => {
    press({ key: "r" })
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("'5' switches to pentagon tool", () => {
    press({ key: "5" })
    expect(useAppStore.getState().activeTool).toBe("pentagon")
  })

  it("'8' switches to octagon tool", () => {
    press({ key: "8" })
    expect(useAppStore.getState().activeTool).toBe("octagon")
  })

  it("'7' switches to the table tool", () => {
    press({ key: "7" })
    expect(useAppStore.getState().activeTool).toBe("table")
  })

  it("Cmd+/ opens command palette", () => {
    press({ key: "/", metaKey: true })
    expect(useAppStore.getState().paletteOpen).toBe(true)
  })

  it("Cmd+F opens find", () => {
    useAppStore.getState().setFindOpen(false)
    press({ key: "f", metaKey: true })
    expect(useAppStore.getState().findOpen).toBe(true)
  })

  it("'f' switches to frame tool", () => {
    press({ key: "f" })
    expect(useAppStore.getState().activeTool).toBe("frame")
  })

  it("Escape clears selection", () => {
    useAppStore.getState().setSelection(["a"])
    press({ key: "Escape" })
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("'?' opens help dialog", () => {
    press({ key: "?" })
    expect(useAppStore.getState().openDialog).toBe("help")
  })

  it("Cmd+K opens the link editor for a single selected unlocked element", () => {
    useAppStore.getState().setLinkEditorElementId(null)
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    press({ key: "k", metaKey: true })
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
    press({ key: "k", metaKey: true })
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("Cmd+K on a locked element is a no-op", () => {
    useAppStore.getState().setLinkEditorElementId(null)
    const r = { ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }), locked: true }
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    press({ key: "k", metaKey: true })
    expect(useAppStore.getState().linkEditorElementId).toBeNull()
  })

  it("Ctrl+Shift+L locks the selection and clears it", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    press({ key: "L", ctrlKey: true, shiftKey: true })
    expect(scene.getElements()[0]!.locked).toBe(true)
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("Ctrl+Shift+L with empty selection is a no-op", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    press({ key: "L", ctrlKey: true, shiftKey: true })
    expect(scene.getElements()[0]!.locked).toBe(false)
  })

  it("Ctrl+A selects all unlocked elements, skipping bound labels", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const locked = { ...newRectangle({ x: 20, y: 0, width: 10, height: 10 }), locked: true }
    const label = { ...newText({ x: 2, y: 2, text: "hi" }), containerId: r.id }
    scene.mutate((draft) => {
      draft.push(r, locked, label)
    })
    press({ key: "a", ctrlKey: true })
    expect(useAppStore.getState().selectedIds).toEqual([r.id])
  })

  it("ArrowRight nudges the selection by 1px; Shift+ArrowDown by 10px", () => {
    const r = newRectangle({ x: 5, y: 5, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    press({ key: "ArrowRight" })
    expect(scene.getElements()[0]!.x).toBe(6)
    press({ key: "ArrowDown", shiftKey: true })
    expect(scene.getElements()[0]!.y).toBe(15)
  })

  it("arrow keys with empty selection leave the scene untouched", () => {
    const r = newRectangle({ x: 5, y: 5, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    press({ key: "ArrowLeft" })
    expect(scene.getElements()[0]!.x).toBe(5)
  })

  it("Shift+H flips the selection across the x-axis", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((draft) => {
      draft.push(tri)
    })
    useAppStore.getState().setSelection([tri.id])
    press({ key: "H", shiftKey: true })
    expect(scene.getElements()[0]!.mirror).toEqual([-1, 1])
  })

  it("Shift+V with a non-empty selection flips and does NOT switch to the selection tool", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((draft) => {
      draft.push(tri)
    })
    useAppStore.getState().setSelection([tri.id])
    useAppStore.getState().setActiveTool("rectangle")
    press({ key: "V", shiftKey: true })
    expect(scene.getElements()[0]!.mirror).toEqual([1, -1])
    expect(useAppStore.getState().activeTool).toBe("rectangle")
  })

  it("Shift+V with an empty selection is a no-op", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 40, height: 30 })
    scene.mutate((draft) => {
      draft.push(tri)
    })
    useAppStore.getState().setActiveTool("rectangle")
    press({ key: "V", shiftKey: true })
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
    press({ key: "H", shiftKey: true })
    const els = scene.getElements()
    expect(els.find((e) => e.id === a.id)!.x).toBe(90)
    expect(els.find((e) => e.id === b.id)!.x).toBe(0)
    expect(els[0]!.mirror).toEqual([-1, 1])
  })

  it("Alt+PageDown calls onNextPage when provided", () => {
    detach()
    const onNextPage = vi.fn()
    detach = attachShortcuts({ scene, onNextPage })
    press({ key: "PageDown", altKey: true })
    expect(onNextPage).toHaveBeenCalledTimes(1)
  })

  it("Alt+PageUp calls onPrevPage when provided", () => {
    detach()
    const onPrevPage = vi.fn()
    detach = attachShortcuts({ scene, onPrevPage })
    press({ key: "PageUp", altKey: true })
    expect(onPrevPage).toHaveBeenCalledTimes(1)
  })

  it("Alt+PageDown without a handler does not throw", () => {
    press({ key: "PageDown", altKey: true })
  })

  it("Alt+/ calls onToggleStats when provided", () => {
    detach()
    const onToggleStats = vi.fn()
    detach = attachShortcuts({ scene, onToggleStats })
    press({ key: "/", altKey: true })
    expect(onToggleStats).toHaveBeenCalledTimes(1)
  })

  it("Alt+/ without a handler does not throw", () => {
    press({ key: "/", altKey: true })
  })

  it("Shift+/ still opens the help dialog (not confused with Alt+/)", () => {
    useAppStore.getState().setOpenDialog(null)
    press({ key: "/", shiftKey: true })
    expect(useAppStore.getState().openDialog).toBe("help")
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

    press({ key: "r" })
    expect(useAppStore.getState().activeTool).toBe("selection")

    press({ key: "z", metaKey: true })
    expect(scene.getElements().map((e) => e.id)).toEqual([r.id])
  })

  it("resumes handling shortcuts after exitPresentation", () => {
    useAppStore.getState().enterPresentation()
    useAppStore.getState().exitPresentation()
    press({ key: "r" })
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
    press({ key: "0", ctrlKey: true })
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
    press({ key: "+", ctrlKey: true })
    expect(useAppStore.getState().zoom).toBeCloseTo(1.1)
  })

  it("Ctrl+- zooms out by one step", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
    press({ key: "-", ctrlKey: true })
    expect(useAppStore.getState().zoom).toBeCloseTo(1 / 1.1)
  })

  it("Ctrl++ respects ZOOM_MAX", () => {
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: ZOOM_MAX })
    press({ key: "+", ctrlKey: true })
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
    press({ key: "c", ctrlKey: true, altKey: true })
  }
  const paste = (): void => {
    press({ key: "v", ctrlKey: true, altKey: true })
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

  it("Ctrl+Alt+V re-measures a free text whose font family changes", () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createFontAwareStubContext())
    try {
      const source = newText({ x: 0, y: 0, text: "src", fontFamily: 3, fontSize: 20 })
      const target = {
        ...newText({ x: 0, y: 50, text: "hello", fontFamily: 1, fontSize: 20 }),
        width: 1,
        height: 1,
      }
      scene.mutate((draft) => {
        draft.push(source, target)
      })
      useAppStore.getState().setSelection([source.id])
      copy()
      useAppStore.getState().setSelection([target.id])
      paste()
      const out = scene.getElements().find((e) => e.id === target.id) as ExcalidrawTextElement
      expect(out.fontFamily).toBe(3)
      // stub: 5 chars × 20px × 0.6 (Cascadia) = 60
      expect(out.width).toBe(60)
    } finally {
      getContextSpy.mockRestore()
    }
  })
})

describe("Ctrl/Cmd+Arrow flowchart chaining", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachShortcuts({ scene })
    useAppStore.getState().setActiveTool("selection")
    useAppStore.getState().setSelection([])
  })
  afterEach(() => detach())

  const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const ev = new KeyboardEvent("keydown", { key, cancelable: true, ...init })
    window.dispatchEvent(ev)
    return ev
  }

  it("Ctrl+ArrowRight chains a bound shape from a single selected rectangle and selects it", () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 50 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    const ev = press("ArrowRight", { ctrlKey: true })
    expect(ev.defaultPrevented).toBe(true)
    const els = scene.getElements()
    const rects = els.filter((e) => e.type === "rectangle")
    const arrows = els.filter((e) => e.type === "arrow")
    expect(rects).toHaveLength(2)
    expect(arrows).toHaveLength(1)
    const created = rects.find((e) => e.id !== r.id)!
    expect(created.x).toBe(180)
    expect(created.y).toBe(0)
    // source is not nudged by the same keypress
    expect(els.find((e) => e.id === r.id)!.x).toBe(0)
    expect(useAppStore.getState().selectedIds).toEqual([created.id])
  })

  it("Cmd+ArrowDown works with metaKey and repeated presses extend the chain", () => {
    const t = newTriangle({ x: 0, y: 0, width: 40, height: 40 })
    scene.mutate((draft) => {
      draft.push(t)
    })
    useAppStore.getState().setSelection([t.id])
    press("ArrowDown", { metaKey: true })
    press("ArrowDown", { metaKey: true })
    const tris = scene.getElements().filter((e) => e.type === "triangle")
    expect(tris.map((e) => e.y).sort((a, b) => a - b)).toEqual([0, 120, 240])
    expect(scene.getElements().filter((e) => e.type === "arrow")).toHaveLength(2)
  })

  it("Ctrl+Arrow with nothing selected is a no-op", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    const before = scene.getElements()
    const ev = press("ArrowRight", { ctrlKey: true })
    expect(ev.defaultPrevented).toBe(false)
    expect(scene.getElements()).toEqual(before)
  })

  it("Ctrl+Arrow with a non-chainable selection (text) is a true no-op, not a nudge", () => {
    const tx = newText({ x: 0, y: 0, text: "hi" })
    scene.mutate((draft) => {
      draft.push(tx)
    })
    useAppStore.getState().setSelection([tx.id])
    const ev = press("ArrowRight", { ctrlKey: true })
    expect(ev.defaultPrevented).toBe(false)
    expect(scene.getElements()).toHaveLength(1)
    expect(scene.getElements()[0]!.x).toBe(0)
  })

  it("Ctrl+Arrow with multiple shapes selected is a true no-op, not a nudge", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 50, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(a, b)
    })
    useAppStore.getState().setSelection([a.id, b.id])
    const ev = press("ArrowRight", { ctrlKey: true })
    expect(ev.defaultPrevented).toBe(false)
    expect(scene.getElements()).toHaveLength(2)
    expect(scene.getElements().some((e) => e.type === "arrow")).toBe(false)
    expect(scene.getElements().find((e) => e.id === a.id)!.x).toBe(0)
    expect(scene.getElements().find((e) => e.id === b.id)!.x).toBe(50)
  })

  it("plain ArrowRight still nudges a selected rectangle without chaining", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((draft) => {
      draft.push(r)
    })
    useAppStore.getState().setSelection([r.id])
    press("ArrowRight")
    expect(scene.getElements()).toHaveLength(1)
    expect(scene.getElements()[0]!.x).toBe(1)
  })
})

describe("view mode (read-only editor)", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    detach = attachShortcuts({ scene })
    const s = useAppStore.getState()
    s.exitPresentation()
    s.setViewMode(false)
    s.setActiveTool("selection")
    s.setSelection([scene.getElements()[0]!.id])
  })
  afterEach(() => {
    detach()
    useAppStore.getState().setViewMode(false)
  })

  it("Alt+R toggles view mode, clears selection, and does not switch tool", () => {
    press({ key: "®", code: "KeyR", altKey: true })
    const s = useAppStore.getState()
    expect(s.viewMode).toBe(true)
    expect(s.selectedIds).toEqual([])
    expect(s.activeTool).toBe("selection")
    press({ key: "r", code: "KeyR", altKey: true })
    expect(useAppStore.getState().viewMode).toBe(false)
  })

  it("is ignored while presenting", () => {
    useAppStore.getState().enterPresentation()
    press({ key: "r", code: "KeyR", altKey: true })
    expect(useAppStore.getState().viewMode).toBe(false)
    useAppStore.getState().exitPresentation()
  })

  it("mutating and tool shortcuts are no-ops in view mode", () => {
    const id = scene.getElements()[0]!.id
    useAppStore.getState().setViewMode(true)
    useAppStore.getState().setSelection([id])
    press({ key: "Delete" })
    press({ key: "z", ctrlKey: true })
    press({ key: "ArrowRight" })
    press({ key: "h", shiftKey: true })
    press({ key: "g", ctrlKey: true })
    press({ key: "r" })
    expect(scene.getElements()[0]).toMatchObject({ id, x: 0, isDeleted: false })
    expect(useAppStore.getState().activeTool).toBe("selection")
  })

  it("laser, find and zoom shortcuts still work", () => {
    useAppStore.getState().setViewMode(true)
    press({ key: "k" })
    expect(useAppStore.getState().activeTool).toBe("laser")
    press({ key: "f", ctrlKey: true })
    expect(useAppStore.getState().findOpen).toBe(true)
    useAppStore.getState().setFindOpen(false)
  })
})
