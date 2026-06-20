import { describe, expect, it } from "vitest"
import { newRectangle, newText } from "../src/factories"
import { NOTE_PADDING } from "../src/reconcile-bound-text"
import { Scene } from "../src/scene"
import type { ExcalidrawElement } from "../src/types"

const notePair = (): ExcalidrawElement[] => {
  const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
  const container = {
    ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
    id: "C",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  return [container, text]
}

describe("Scene.mutate reconciles bound text", () => {
  it("moving the container moves its bound text", () => {
    const scene = new Scene(notePair())
    scene.mutate((draft) => {
      const c = draft.find((e) => e.id === "C")!
      const i = draft.indexOf(c)
      draft[i] = { ...c, x: c.x + 50, y: c.y + 30 }
    })
    const text = scene.getElements().find((e) => e.type === "text")!
    expect(text.x).toBe(50 + NOTE_PADDING)
    expect(text.y).toBe(30 + NOTE_PADDING)
  })

  it("deleting the container deletes its bound text", () => {
    const scene = new Scene(notePair())
    scene.mutate((draft) => {
      const c = draft.find((e) => e.id === "C")!
      const i = draft.indexOf(c)
      draft[i] = { ...c, isDeleted: true }
    })
    const text = scene.getElementsIncludingDeleted().find((e) => e.type === "text")!
    expect(text.isDeleted).toBe(true)
  })
})
