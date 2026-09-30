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
