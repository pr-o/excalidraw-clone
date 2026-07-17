import { describe, expect, it } from "vitest"
import {
  LABELABLE_TYPES,
  newDiamond,
  newHexagon,
  newLabelFor,
  newNote,
  reconcileBoundText,
} from "../src"
import type { ExcalidrawElement } from "../src"

describe("LABELABLE_TYPES", () => {
  it("contains exactly the six container shapes", () => {
    expect([...LABELABLE_TYPES].sort()).toEqual([
      "diamond",
      "ellipse",
      "hexagon",
      "parallelogram",
      "rectangle",
      "triangle",
    ])
  })
})

describe("newLabelFor", () => {
  it("returns a centered empty text bound to the container", () => {
    const hexagon = newHexagon({ x: 0, y: 0, width: 100, height: 80 })
    const label = newLabelFor(hexagon)
    expect(label.type).toBe("text")
    expect(label.text).toBe("")
    expect(label.textAlign).toBe("center")
    expect(label.verticalAlign).toBe("middle")
    expect(label.containerId).toBe(hexagon.id)
  })

  it("uses the shape-aware inner box (hexagon: 25% x-inset, 8px y-inset)", () => {
    const hexagon = newHexagon({ x: 0, y: 0, width: 100, height: 80 })
    const label = newLabelFor(hexagon)
    expect({ x: label.x, y: label.y, width: label.width, height: label.height }).toEqual({
      x: 25,
      y: 8,
      width: 50,
      height: 64,
    })
  })
})

describe("reconcileBoundText — shape-aware boxes", () => {
  it("keeps a diamond's label inside the centered half-size box after a move", () => {
    const diamond = newDiamond({ x: 0, y: 0, width: 100, height: 80 })
    const label = newLabelFor(diamond)
    const linked: ExcalidrawElement = {
      ...diamond,
      boundElements: [{ id: label.id, type: "text" }],
    }
    const draft: ExcalidrawElement[] = [{ ...linked, x: 200, y: 100 }, label]
    reconcileBoundText(draft)
    const text = draft[1]!
    expect({ x: text.x, y: text.y, width: text.width, height: text.height }).toEqual({
      x: 225,
      y: 120,
      width: 50,
      height: 40,
    })
  })

  it("keeps sticky-note (rectangle) behavior byte-identical: 8px inset", () => {
    const { container, text } = newNote({ x: 10, y: 20, width: 100, height: 60 })
    const draft: ExcalidrawElement[] = [container, text]
    reconcileBoundText(draft)
    const t = draft[1]!
    expect({ x: t.x, y: t.y, width: t.width, height: t.height }).toEqual({
      x: 18,
      y: 28,
      width: 84,
      height: 44,
    })
  })
})
