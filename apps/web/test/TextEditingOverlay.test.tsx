import {
  newLabelFor,
  newRectangle,
  newText,
  Scene,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { TextEditingOverlay } from "../src/components/TextEditingOverlay"
import { useAppStore } from "../src/store"

const renderOverlay = (scene: Scene) => render(<TextEditingOverlay scene={scene} />)

/** The overlay focuses its textarea in a microtask after mount; wait for it
 *  so jsdom's blur() (fired by the Escape handler) dispatches focusout. */
const focusedTextarea = async (container: HTMLElement): Promise<HTMLTextAreaElement> => {
  const textarea = container.querySelector("textarea")
  if (!textarea) throw new Error("textarea not rendered")
  await waitFor(() => expect(document.activeElement).toBe(textarea))
  return textarea
}

const textOf = (scene: Scene, id: string): string | undefined =>
  (scene.getElements().find((e) => e.id === id) as ExcalidrawTextElement | undefined)?.text

beforeEach(() => {
  useAppStore.getState().setTextEditElementId(null)
  useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 1 })
})
afterEach(() => cleanup())

describe("TextEditingOverlay — Escape commits like click-away", () => {
  it("commits typed text on a new, empty text element", async () => {
    const scene = new Scene()
    const text = newText({ x: 10, y: 10 })
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setTextEditElementId(text.id)

    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)

    fireEvent.change(textarea, { target: { value: "hello" } })
    fireEvent.keyDown(textarea, { key: "Escape" })

    expect(textOf(scene, text.id)).toBe("hello")
    expect(useAppStore.getState().textEditElementId).toBeNull()
  })

  it("commits an edit to existing text instead of reverting it", async () => {
    const scene = new Scene()
    const text = newText({ x: 10, y: 10, text: "old" })
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setTextEditElementId(text.id)

    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)
    expect(textarea.value).toBe("old")

    fireEvent.change(textarea, { target: { value: "new" } })
    fireEvent.keyDown(textarea, { key: "Escape" })

    expect(textOf(scene, text.id)).toBe("new")
    expect(useAppStore.getState().textEditElementId).toBeNull()
  })

  it("deletes an empty bound label and unlinks it from its container", async () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = newLabelFor(rect)
    scene.mutate((d) => {
      d.push({ ...rect, boundElements: [{ id: label.id, type: "text" }] }, label)
    })
    useAppStore.getState().setTextEditElementId(label.id)

    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)

    fireEvent.keyDown(textarea, { key: "Escape" })

    expect(scene.getElements().find((e) => e.id === label.id)).toBeUndefined()
    expect(scene.getElements().find((e) => e.id === rect.id)?.boundElements).toBeNull()
    expect(useAppStore.getState().textEditElementId).toBeNull()
  })
})

describe("TextEditingOverlay — WYSIWYG font styling", () => {
  it("styles the textarea with the element's font family, weight, and style", async () => {
    const scene = new Scene()
    const text = newText({
      x: 10,
      y: 10,
      text: "styled",
      fontFamily: 3,
      fontWeight: "bold",
      fontStyle: "italic",
    })
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setTextEditElementId(text.id)

    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)

    expect(textarea.style.fontFamily).toContain("Cascadia Code")
    expect(textarea.style.fontFamily).not.toContain("Caveat")
    expect(textarea.style.fontWeight).toBe("bold")
    expect(textarea.style.fontStyle).toBe("italic")
  })

  it("aligns the textarea like the element", async () => {
    const scene = new Scene()
    const text = newText({ x: 10, y: 10, text: "a\nlonger", textAlign: "right" })
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setTextEditElementId(text.id)

    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)

    expect(textarea.style.textAlign).toBe("right")
  })

  it("defaults a legacy element without weight/style to normal", async () => {
    const scene = new Scene()
    const { fontWeight: _w, fontStyle: _s, ...legacy } = newText({ x: 10, y: 10, text: "old" })
    scene.mutate((d) => d.push(legacy))
    useAppStore.getState().setTextEditElementId(legacy.id)

    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)

    expect(textarea.style.fontFamily).toContain("Caveat")
    expect(textarea.style.fontWeight).toBe("normal")
    expect(textarea.style.fontStyle).toBe("normal")
  })
})

/** jsdom has no 2D canvas; stub measureText at 6px per character (same
 *  convention as pageThumbnails.test.ts). */
function createStubContext(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      if (prop === "measureText") return (text: string) => ({ width: String(text).length * 6 })
      return () => undefined
    },
    set(target, prop, value) {
      target[prop as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

describe("TextEditingOverlay — standalone text is sized from its content on commit", () => {
  let getContextSpy: MockInstance<typeof HTMLCanvasElement.prototype.getContext>
  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => createStubContext())
  })
  afterEach(() => getContextSpy.mockRestore())

  const commitFree = async (typed: string, via: "escape" | "blur") => {
    const scene = new Scene()
    const text = newText({ x: 10, y: 10 })
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setTextEditElementId(text.id)
    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)
    fireEvent.change(textarea, { target: { value: typed } })
    if (via === "escape") fireEvent.keyDown(textarea, { key: "Escape" })
    else fireEvent.blur(textarea)
    const el = scene.getElements().find((e) => e.id === text.id) as ExcalidrawTextElement
    cleanup()
    return el
  }

  it("gives a committed free text element a non-zero box that scales with content (Escape)", async () => {
    const short = await commitFree("hi", "escape")
    const long = await commitFree("hello world", "escape")
    expect(short.width).toBeGreaterThan(0)
    expect(short.height).toBeGreaterThan(0)
    expect(long.width).toBeGreaterThan(short.width)
  })

  it("gives a committed free text element a non-zero box on blur", async () => {
    const el = await commitFree("hello", "blur")
    expect(el.width).toBeGreaterThan(0)
    expect(el.height).toBeGreaterThan(0)
  })

  it("more lines produce a taller box", async () => {
    const one = await commitFree("a", "escape")
    const two = await commitFree("a\nb", "escape")
    expect(two.height).toBeGreaterThan(one.height)
  })

  it("does not measure a bound label (container sizing governs it)", async () => {
    const scene = new Scene()
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = newLabelFor(rect)
    scene.mutate((d) => {
      d.push({ ...rect, boundElements: [{ id: label.id, type: "text" }] }, label)
    })
    const before = scene.getElements().find((e) => e.id === label.id)!
    useAppStore.getState().setTextEditElementId(label.id)
    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)
    getContextSpy.mockClear()
    fireEvent.change(textarea, { target: { value: "a much longer label than before" } })
    fireEvent.keyDown(textarea, { key: "Escape" })
    const after = scene.getElements().find((e) => e.id === label.id)!
    expect(getContextSpy).not.toHaveBeenCalled()
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
  })
})

describe("TextEditingOverlay — fixed-width text", () => {
  it("sizes the textarea to the fixed width and wraps", async () => {
    const scene = new Scene()
    const text = { ...newText({ x: 0, y: 0, text: "hello world" }), autoResize: false, width: 60 }
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setView({ scrollX: 0, scrollY: 0, zoom: 2 })
    useAppStore.getState().setTextEditElementId(text.id)
    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)
    expect(textarea.style.width).toBe("120px")
    expect(textarea.style.whiteSpace).toBe("pre-wrap")
  })

  it("leaves auto-resizing text without a fixed width", async () => {
    const scene = new Scene()
    const text = newText({ x: 0, y: 0, text: "hello world" })
    scene.mutate((d) => d.push(text))
    useAppStore.getState().setTextEditElementId(text.id)
    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)
    expect(textarea.style.width).toBe("")
  })
})

describe("TextEditingOverlay — rich text", () => {
  const spansOf = (scene: Scene, id: string) =>
    (scene.getElements().find((e) => e.id === id) as ExcalidrawTextElement | undefined)?.spans

  const open = async (text: string, spans?: ExcalidrawTextElement["spans"]) => {
    const scene = new Scene()
    const t = { ...newText({ x: 10, y: 10, text }), ...(spans ? { spans } : {}) }
    scene.mutate((d) => d.push(t))
    useAppStore.getState().setTextEditElementId(t.id)
    const { container } = renderOverlay(scene)
    const textarea = await focusedTextarea(container)
    return { scene, t, container, textarea }
  }

  it("Ctrl+B on a selection bolds it and commits spans", async () => {
    const { scene, t, textarea } = await open("hello world")
    textarea.setSelectionRange(6, 11)
    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true })
    fireEvent.keyDown(textarea, { key: "Escape" })
    expect(spansOf(scene, t.id)).toEqual([{ start: 6, end: 11, bold: true }])
  })

  it("Ctrl+B again clears it; Cmd+I italicizes", async () => {
    const { scene, t, textarea } = await open("hello world", [{ start: 6, end: 11, bold: true }])
    textarea.setSelectionRange(6, 11)
    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true })
    textarea.setSelectionRange(0, 5)
    fireEvent.keyDown(textarea, { key: "i", metaKey: true })
    fireEvent.keyDown(textarea, { key: "Escape" })
    expect(spansOf(scene, t.id)).toEqual([{ start: 0, end: 5, italic: true }])
  })

  it("a bare-caret Ctrl+B sets the typing style for the next characters only", async () => {
    const { scene, t, textarea } = await open("ab")
    textarea.setSelectionRange(2, 2)
    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true })
    fireEvent.change(textarea, { target: { value: "abcd" } })
    fireEvent.keyDown(textarea, { key: "Escape" })
    expect(spansOf(scene, t.id)).toEqual([{ start: 2, end: 4, bold: true }])
  })

  it("typing inside a bold run extends it; editing before it shifts it", async () => {
    const { scene, t, textarea } = await open("ab cd", [{ start: 3, end: 5, bold: true }])
    fireEvent.change(textarea, { target: { value: "ab cXd" } })
    fireEvent.change(textarea, { target: { value: "ZZab cXd" } })
    fireEvent.keyDown(textarea, { key: "Escape" })
    expect(spansOf(scene, t.id)).toEqual([{ start: 5, end: 8, bold: true }])
  })

  it("IME composition steps keep spans consistent with the final text", async () => {
    const { scene, t, textarea } = await open("ab", [{ start: 0, end: 2, bold: true }])
    textarea.setSelectionRange(2, 2)
    fireEvent.compositionStart(textarea)
    for (const v of ["abㅎ", "ab하", "ab한"]) fireEvent.change(textarea, { target: { value: v } })
    fireEvent.compositionEnd(textarea)
    fireEvent.keyDown(textarea, { key: "Escape" })
    expect(textOf(scene, t.id)).toBe("ab한")
    expect(spansOf(scene, t.id)).toEqual([{ start: 0, end: 3, bold: true }])
  })

  it("converts '- ' to a bullet and Enter continues / ends the list", async () => {
    const { scene, t, textarea } = await open("")
    fireEvent.change(textarea, { target: { value: "- " } })
    expect(textarea.value).toBe("• ")
    fireEvent.change(textarea, { target: { value: "• item" } })
    textarea.setSelectionRange(6, 6)
    fireEvent.keyDown(textarea, { key: "Enter" })
    expect(textarea.value).toBe("• item\n• ")
    fireEvent.keyDown(textarea, { key: "Enter" })
    expect(textarea.value).toBe("• item\n")
    fireEvent.keyDown(textarea, { key: "Escape" })
    expect(textOf(scene, t.id)).toBe("• item\n")
  })

  it("renders a styled mirror only when spans exist", async () => {
    const plain = await open("abc")
    expect(plain.container.querySelector("[data-testid=text-mirror]")).toBeNull()
    cleanup()
    const rich = await open("abc", [{ start: 0, end: 1, bold: true }])
    expect(rich.container.querySelector("[data-testid=text-mirror] [data-bold]")?.textContent).toBe(
      "a",
    )
  })
})
