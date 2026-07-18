import { describe, expect, it } from "vitest"
import {
  LABELABLE_TYPES,
  LINEAR_LABELABLE_TYPES,
  newArrow,
  newDiamond,
  newHexagon,
  newLabelFor,
  newLabelForLinear,
  newLine,
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

describe("LINEAR_LABELABLE_TYPES", () => {
  it("contains exactly arrow and line", () => {
    expect([...LINEAR_LABELABLE_TYPES].sort()).toEqual(["arrow", "line"])
  })
})

describe("newLabelForLinear", () => {
  it("returns a centered empty text bound to the arrow", () => {
    const arrow = {
      ...newArrow({ x: 100, y: 50 }),
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
    }
    const label = newLabelForLinear(arrow)
    expect(label.type).toBe("text")
    expect(label.text).toBe("")
    expect(label.textAlign).toBe("center")
    expect(label.verticalAlign).toBe("middle")
    expect(label.containerId).toBe(arrow.id)
  })

  it("centers a zero-width box on the path midpoint", () => {
    // segment lengths 40 + 40; half of 80 lands at the corner (40, 0)
    const arrow = {
      ...newArrow({ x: 100, y: 50 }),
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
    }
    const label = newLabelForLinear(arrow)
    // height = DEFAULT_FONT_SIZE 20 × DEFAULT_LINE_HEIGHT 1.25 = 25
    expect({ x: label.x, y: label.y, width: label.width, height: label.height }).toEqual({
      x: 140,
      y: 37.5,
      width: 0,
      height: 25,
    })
  })
})

describe("reconcileBoundText — linear containers", () => {
  const linkedLine = () => {
    const line = {
      ...newLine({ x: 0, y: 0, width: 100, height: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    const label = { ...newLabelForLinear(line), width: 24, height: 24 }
    const linked = { ...line, boundElements: [{ id: label.id, type: "text" as const }] }
    return { linked, label }
  }

  it("recenters the label on the midpoint after the container moves", () => {
    const { linked, label } = linkedLine()
    const draft: ExcalidrawElement[] = [{ ...linked, x: 200, y: 100 }, label]
    reconcileBoundText(draft)
    const t = draft[1]!
    expect({ x: t.x, y: t.y }).toEqual({ x: 250 - 12, y: 100 - 12 })
  })

  it("recenters after the points change and never resizes", () => {
    const { linked, label } = linkedLine()
    const bent = {
      ...linked,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    }
    const draft: ExcalidrawElement[] = [bent, label]
    reconcileBoundText(draft)
    const t = draft[1]!
    // total length 200, half = 100 → the corner (100, 0)
    expect({ x: t.x, y: t.y, width: t.width, height: t.height }).toEqual({
      x: 100 - 12,
      y: 0 - 12,
      width: 24,
      height: 24,
    })
  })

  it("is idempotent: a second pass leaves the label reference-equal", () => {
    const { linked, label } = linkedLine()
    const draft: ExcalidrawElement[] = [linked, label]
    reconcileBoundText(draft)
    const after = draft[1]!
    reconcileBoundText(draft)
    expect(draft[1]).toBe(after)
  })

  it("cascades isDeleted from a deleted arrow to its label", () => {
    const arrow = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    }
    const label = newLabelForLinear(arrow)
    const draft: ExcalidrawElement[] = [
      { ...arrow, boundElements: [{ id: label.id, type: "text" }], isDeleted: true },
      label,
    ]
    reconcileBoundText(draft)
    expect(draft[1]!.isDeleted).toBe(true)
  })
})
