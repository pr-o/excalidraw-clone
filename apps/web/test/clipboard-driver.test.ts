import {
  newLabelFor,
  newRectangle,
  type ExcalidrawElement,
  type ExcalidrawTextElement,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { buildPaste, CLIPBOARD_TYPE, copyPayload } from "../src/driver/clipboard"

const labeledRect = () => {
  const rect = newRectangle({ x: 100, y: 100, width: 40, height: 40 })
  const label = { ...newLabelFor(rect), text: "hi" }
  return {
    rect: { ...rect, boundElements: [{ id: label.id, type: "text" as const }] },
    label,
  }
}

describe("copyPayload", () => {
  it("serializes the closure into the envelope and reports closure ids", () => {
    const { rect, label } = labeledRect()
    const out = copyPayload([rect, label], [rect.id])!
    expect(out.ids).toEqual([rect.id, label.id])
    const parsed = JSON.parse(out.text) as { type: string; elements: ExcalidrawElement[] }
    expect(parsed.type).toBe(CLIPBOARD_TYPE)
    expect(parsed.elements.map((e) => e.id)).toEqual([rect.id, label.id])
  })

  it("returns null for an empty selection", () => {
    expect(copyPayload([], [])).toBeNull()
    expect(copyPayload([newRectangle({ x: 0, y: 0, width: 5, height: 5 })], [])).toBeNull()
  })
})

describe("buildPaste", () => {
  it("round-trips with fresh ids, remapped refs, and bbox centered at the target", () => {
    const { rect, label } = labeledRect()
    const { text } = copyPayload([rect, label], [rect.id])!
    const pasted = buildPaste(text, { x: 500, y: 300 })
    expect(pasted).toHaveLength(2)
    const [r, l] = pasted as [ExcalidrawElement, ExcalidrawTextElement]
    expect(r.id).not.toBe(rect.id)
    expect(l.containerId).toBe(r.id)
    expect(r.boundElements).toEqual([{ id: l.id, type: "text" }])
    // source bbox center is (120, 120) → offset (+380, +180)
    expect(r.x).toBe(480)
    expect(r.y).toBe(280)
  })

  it("two pastes of the same payload produce distinct ids", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const { text } = copyPayload([rect], [rect.id])!
    const a = buildPaste(text, { x: 50, y: 50 })
    const b = buildPaste(text, { x: 50, y: 50 })
    expect(a[0]!.id).not.toBe(b[0]!.id)
  })

  it("non-envelope text becomes a text element at the cursor", () => {
    const pasted = buildPaste("hello canvas", { x: 30, y: 40 })
    expect(pasted).toHaveLength(1)
    const t = pasted[0] as ExcalidrawTextElement
    expect(t.type).toBe("text")
    expect(t.text).toBe("hello canvas")
    expect(t.x).toBe(30)
    expect(t.y).toBe(40)
  })

  it("blank text and empty envelopes produce nothing", () => {
    expect(buildPaste("   ", { x: 0, y: 0 })).toEqual([])
    expect(
      buildPaste(JSON.stringify({ type: CLIPBOARD_TYPE, version: 1, elements: [] }), {
        x: 0,
        y: 0,
      }),
    ).toEqual([])
  })
})
