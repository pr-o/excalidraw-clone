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

  it("empty commit on a freshly-placed free text element (never had content) deletes it", () => {
    const fresh = newText({ x: 0, y: 0 }) // no `text` given -> defaults to ""
    const draft: ExcalidrawElement[] = [fresh]
    commitTextEdit(draft, fresh.id, "")
    expect(draft).toHaveLength(0)
  })

  it("unknown id is a no-op", () => {
    const draft: ExcalidrawElement[] = []
    expect(() => commitTextEdit(draft, "nope", "x")).not.toThrow()
    expect(draft).toHaveLength(0)
  })
  it("measuredSize resizes a standalone text element along with its text", () => {
    const free = newText({ x: 0, y: 0 })
    const draft: ExcalidrawElement[] = [free]
    commitTextEdit(draft, free.id, "hello", { width: 42, height: 25 })
    const t = draft[0] as ExcalidrawTextElement
    expect(t.text).toBe("hello")
    expect(t.width).toBe(42)
    expect(t.height).toBe(25)
  })

  it("measuredSize also shrinks existing standalone text", () => {
    const free = { ...newText({ x: 0, y: 0, text: "a long line" }), width: 200, height: 25 }
    const draft: ExcalidrawElement[] = [free]
    commitTextEdit(draft, free.id, "a", { width: 8, height: 25 })
    expect(draft[0]!.width).toBe(8)
    expect(draft[0]!.height).toBe(25)
  })

  it("measuredSize is ignored for a bound label", () => {
    const { container, label } = labeledRect()
    const draft: ExcalidrawElement[] = [container, label]
    commitTextEdit(draft, label.id, "hello", { width: 999, height: 999 })
    const t = draft[1] as ExcalidrawTextElement
    expect(t.text).toBe("hello")
    expect(t.width).toBe(label.width)
    expect(t.height).toBe(label.height)
  })

  it("omitting measuredSize leaves a standalone element's size untouched", () => {
    const free = newText({ x: 0, y: 0 })
    const draft: ExcalidrawElement[] = [free]
    commitTextEdit(draft, free.id, "hello")
    expect(draft[0]!.width).toBe(0)
    expect(draft[0]!.height).toBe(0)
  })
})
