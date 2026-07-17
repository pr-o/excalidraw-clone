import {
  newLabelFor,
  newRectangle,
  newText,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { commitTextEdit } from "../src/driver/commitTextEdit"

const labeledRect = (): { container: ExcalidrawElement; label: ExcalidrawTextElement } => {
  const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
  const label = newLabelFor(rect)
  return { container: { ...rect, boundElements: [{ id: label.id, type: "text" }] }, label }
}

describe("commitTextEdit", () => {
  it("non-empty commit updates the text and keeps the binding", () => {
    const { container, label } = labeledRect()
    const draft: ExcalidrawElement[] = [container, label]
    commitTextEdit(draft, label.id, "hello")
    expect(draft).toHaveLength(2)
    expect((draft[1] as ExcalidrawTextElement).text).toBe("hello")
    expect(draft[0]!.boundElements).toEqual([{ id: label.id, type: "text" }])
  })

  it("empty commit deletes the label and strips the container ref", () => {
    const { container, label } = labeledRect()
    const draft: ExcalidrawElement[] = [container, label]
    commitTextEdit(draft, label.id, "")
    expect(draft).toHaveLength(1)
    expect(draft[0]!.boundElements).toBeNull()
  })

  it("empty commit on a free text element keeps it", () => {
    const free = newText({ x: 0, y: 0, text: "old" })
    const draft: ExcalidrawElement[] = [free]
    commitTextEdit(draft, free.id, "")
    expect(draft).toHaveLength(1)
    expect((draft[0] as ExcalidrawTextElement).text).toBe("")
  })

  it("unknown id is a no-op", () => {
    const draft: ExcalidrawElement[] = []
    expect(() => commitTextEdit(draft, "nope", "x")).not.toThrow()
    expect(draft).toHaveLength(0)
  })
})
