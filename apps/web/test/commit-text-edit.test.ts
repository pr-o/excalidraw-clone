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

describe("commitTextEdit — spans", () => {
  const free = () => newText({ x: 0, y: 0, text: "" })
  it("stores normalized spans with the committed text", () => {
    const t = free()
    const draft: ExcalidrawElement[] = [t]
    commitTextEdit(draft, t.id, "hello world", undefined, [
      { start: 6, end: 8, bold: true },
      { start: 8, end: 99, bold: true },
    ])
    expect((draft[0] as ExcalidrawTextElement).spans).toEqual([{ start: 6, end: 11, bold: true }])
  })
  it("removes stale spans when none are passed", () => {
    const t = {
      ...newText({ x: 0, y: 0, text: "ab" }),
      spans: [{ start: 0, end: 2, bold: true as const }],
    }
    const draft: ExcalidrawElement[] = [t]
    commitTextEdit(draft, t.id, "abc")
    expect("spans" in draft[0]!).toBe(false)
  })
  it("keeps spans together with measured size", () => {
    const t = free()
    const draft: ExcalidrawElement[] = [t]
    commitTextEdit(draft, t.id, "ab", { width: 7, height: 9 }, [{ start: 0, end: 1, italic: true }])
    expect(draft[0]).toMatchObject({
      width: 7,
      height: 9,
      spans: [{ start: 0, end: 1, italic: true }],
    })
  })
})
