import { describe, expect, it } from "vitest"
import { newArrow, newRectangle, newText } from "../src/factories"
import { sanitizeElement, sanitizeElements } from "../src/validate"

describe("sanitizeElement", () => {
  it("keeps a well-formed element as-is", () => {
    const r = newRectangle({ x: 1, y: 2, width: 3, height: 4 })
    expect(sanitizeElement(r)).toEqual(r)
  })

  it("repairs missing neutral fields instead of dropping the element", () => {
    const {
      angle: _a,
      groupIds: _g,
      isDeleted: _d,
      locked: _l,
      opacity: _o,
      ...rest
    } = newRectangle({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    })
    const fixed = sanitizeElement(rest)!
    expect(fixed.angle).toBe(0)
    expect(fixed.groupIds).toEqual([])
    expect(fixed.isDeleted).toBe(false)
    expect(fixed.locked).toBe(false)
    expect(fixed.opacity).toBe(100)
  })

  it("drops what cannot be repaired", () => {
    const ok = newRectangle({ x: 0, y: 0, width: 1, height: 1 })
    expect(sanitizeElement(null)).toBeNull()
    expect(sanitizeElement(7)).toBeNull()
    expect(sanitizeElement({ ...ok, id: "" })).toBeNull()
    expect(sanitizeElement({ ...ok, type: "spaceship" })).toBeNull()
    expect(sanitizeElement({ ...newArrow({ x: 0, y: 0 }), points: undefined })).toBeNull()
    expect(sanitizeElement({ ...newArrow({ x: 0, y: 0 }), points: [{ x: 0 }] })).toBeNull()
  })

  it("repairs non-finite geometry and non-string text instead of dropping", () => {
    const ok = newRectangle({ x: 4, y: 5, width: 1, height: 1 })
    const fixed = sanitizeElement({ ...ok, x: Number.NaN, width: "10" })!
    expect([fixed.x, fixed.y, fixed.width]).toEqual([0, 5, 0])
    const text = sanitizeElement({ ...newText({ x: 0, y: 0, text: "a" }), text: 5 })!
    expect((text as { text: string }).text).toBe("")
  })

  it("clamps opacity into 0..100", () => {
    const ok = newRectangle({ x: 0, y: 0, width: 1, height: 1 })
    expect(sanitizeElement({ ...ok, opacity: 500 })!.opacity).toBe(100)
    expect(sanitizeElement({ ...ok, opacity: -3 })!.opacity).toBe(0)
  })
})

describe("sanitizeElements", () => {
  it("drops unusable entries, keeps the rest in order, and tolerates non-arrays", () => {
    const a = newRectangle({ x: 0, y: 0, width: 1, height: 1 })
    const b = newRectangle({ x: 5, y: 5, width: 1, height: 1 })
    expect(sanitizeElements([a, null, { nope: true }, b]).map((e) => e.id)).toEqual([a.id, b.id])
    expect(sanitizeElements(undefined)).toEqual([])
    expect(sanitizeElements("x")).toEqual([])
  })
})
