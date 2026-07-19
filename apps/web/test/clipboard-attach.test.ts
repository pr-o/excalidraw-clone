import { newLabelFor, newRectangle, Scene } from "@excalidraw-clone/scene"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CLIPBOARD_TYPE, copyPayload } from "../src/driver/clipboard"
import { attachClipboard } from "../src/keyboard/clipboard"
import { useAppStore } from "../src/store"

const clipboardEvent = (
  type: "copy" | "cut" | "paste",
  data: Record<string, string>,
): ClipboardEvent => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(e, "clipboardData", {
    value: {
      getData: (k: string) => data[k] ?? "",
      setData: (k: string, v: string) => {
        data[k] = v
      },
    },
  })
  return e
}

describe("attachClipboard", () => {
  let detach: () => void
  let scene: Scene
  beforeEach(() => {
    scene = new Scene()
    detach = attachClipboard({ scene })
    useAppStore.getState().setSelection([])
  })
  afterEach(() => detach())

  it("copy writes the envelope for the selection closure", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => {
      d.push(rect)
    })
    useAppStore.getState().setSelection([rect.id])
    const data: Record<string, string> = {}
    document.dispatchEvent(clipboardEvent("copy", data))
    expect(data["text/plain"]).toContain(CLIPBOARD_TYPE)
    expect(data["text/plain"]).toContain(rect.id)
  })

  it("cut copies then deletes the closure including bound labels", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 50, height: 40 })
    const label = { ...newLabelFor(rect), text: "hi" }
    const linked = { ...rect, boundElements: [{ id: label.id, type: "text" as const }] }
    scene.mutate((d) => {
      d.push(linked, label)
    })
    useAppStore.getState().setSelection([rect.id])
    const data: Record<string, string> = {}
    document.dispatchEvent(clipboardEvent("cut", data))
    expect(data["text/plain"]).toContain(CLIPBOARD_TYPE)
    expect(scene.getElements()).toHaveLength(0)
    expect(useAppStore.getState().selectedIds).toEqual([])
  })

  it("paste appends fresh-id clones at the tracked pointer and selects them", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const { text } = copyPayload([rect], [rect.id])!
    useAppStore.getState().setLastScenePointer({ x: 200, y: 100 })
    document.dispatchEvent(clipboardEvent("paste", { "text/plain": text }))
    const els = scene.getElements()
    expect(els).toHaveLength(1)
    expect(els[0]!.id).not.toBe(rect.id)
    expect(els[0]!.x).toBe(195) // bbox center (5,5) → (200,100)
    expect(useAppStore.getState().selectedIds).toEqual([els[0]!.id])
  })

  it("plain-text paste creates a text element", () => {
    useAppStore.getState().setLastScenePointer({ x: 40, y: 50 })
    document.dispatchEvent(clipboardEvent("paste", { "text/plain": "hello" }))
    const els = scene.getElements()
    expect(els).toHaveLength(1)
    expect(els[0]!.type).toBe("text")
  })

  it("events targeting an input are ignored", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    scene.mutate((d) => {
      d.push(rect)
    })
    useAppStore.getState().setSelection([rect.id])
    const input = document.createElement("input")
    document.body.appendChild(input)
    const data: Record<string, string> = {}
    input.dispatchEvent(clipboardEvent("copy", data))
    expect(data["text/plain"]).toBeUndefined()
    input.remove()
  })
})
