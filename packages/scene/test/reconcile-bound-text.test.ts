import { describe, expect, it } from "vitest"
import { newRectangle, newText } from "../src/factories"
import { NOTE_PADDING, reconcileBoundText } from "../src/reconcile-bound-text"
import type { ExcalidrawElement } from "../src/types"

const makeNotePair = (): { container: ExcalidrawElement; text: ExcalidrawElement } => {
  const text = newText({ x: 0, y: 0, text: "", containerId: "C" })
  const container = {
    ...newRectangle({ x: 100, y: 100, width: 60, height: 40 }),
    id: "C",
    boundElements: [{ id: text.id, type: "text" as const }],
  }
  return { container, text }
}

describe("reconcileBoundText", () => {
  it("sizes bound text to container box minus padding and centers it", () => {
    const { container, text } = makeNotePair()
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const t = draft.find((e) => e.id === text.id)!
    expect(t.x).toBe(100 + NOTE_PADDING)
    expect(t.y).toBe(100 + NOTE_PADDING)
    expect(t.width).toBe(60 - 2 * NOTE_PADDING)
    expect(t.height).toBe(40 - 2 * NOTE_PADDING)
    if (t.type === "text") {
      expect(t.textAlign).toBe("center")
      expect(t.verticalAlign).toBe("middle")
    }
  })

  it("marks bound text deleted when its container is deleted", () => {
    const { container, text } = makeNotePair()
    const draft: ExcalidrawElement[] = [{ ...container, isDeleted: true }, text]
    reconcileBoundText(draft)
    expect(draft.find((e) => e.id === text.id)!.isDeleted).toBe(true)
  })

  it("never touches text content", () => {
    const text = newText({ x: 0, y: 0, text: "hello", containerId: "C" })
    const container = {
      ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
      id: "C",
      boundElements: [{ id: text.id, type: "text" as const }],
    }
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const t = draft.find((e) => e.id === text.id)!
    if (t.type === "text") expect(t.text).toBe("hello")
  })

  it("is a no-op when there are no bound elements", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const draft: ExcalidrawElement[] = [r]
    reconcileBoundText(draft)
    expect(draft[0]).toBe(r)
  })

  it("is idempotent (second pass changes nothing)", () => {
    const { container, text } = makeNotePair()
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const afterFirst = draft[1]
    reconcileBoundText(draft)
    expect(draft[1]).toBe(afterFirst)
  })

  it("skips a dangling reference whose text is missing", () => {
    const container = {
      ...newRectangle({ x: 0, y: 0, width: 60, height: 40 }),
      id: "C",
      boundElements: [{ id: "missing", type: "text" as const }],
    }
    const draft: ExcalidrawElement[] = [container]
    expect(() => reconcileBoundText(draft)).not.toThrow()
  })
})
