import {
  newLabelFor,
  newRectangle,
  newText,
  Scene,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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
