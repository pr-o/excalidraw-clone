import { describe, expect, it } from "vitest"
import { newArrow, newEllipse, newRectangle, newText } from "../src/factories"
import {
  BINDABLE_TYPES,
  BINDING_GAP,
  bindingTargetAt,
  canBindTo,
  computeBoundEndpoint,
} from "../src/bindings"
import type { ExcalidrawElement } from "../src/types"

const rect = (over: Partial<ExcalidrawElement>): ExcalidrawElement => ({
  ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }),
  ...over,
})

describe("canBindTo", () => {
  it("accepts closed shapes, text, image", () => {
    expect(canBindTo(newRectangle({ x: 0, y: 0, width: 1, height: 1 }))).toBe(true)
    expect(canBindTo(newEllipse({ x: 0, y: 0, width: 1, height: 1 }))).toBe(true)
    expect(canBindTo(newText({ x: 0, y: 0 }))).toBe(true)
  })
  it("rejects arrows and deleted elements", () => {
    expect(canBindTo(newArrow({ x: 0, y: 0 }))).toBe(false)
    expect(canBindTo(rect({ isDeleted: true }))).toBe(false)
  })
  it("BINDABLE_TYPES has the five expected types", () => {
    expect([...BINDABLE_TYPES].sort()).toEqual(["diamond", "ellipse", "image", "rectangle", "text"])
  })
})

describe("bindingTargetAt", () => {
  it("returns the topmost bindable element under the point", () => {
    const a = rect({ id: "a", x: 0, y: 0, width: 100, height: 100 })
    const b = rect({ id: "b", x: 0, y: 0, width: 100, height: 100 })
    expect(bindingTargetAt({ x: 50, y: 50 }, [a, b])?.id).toBe("b")
  })
  it("returns null over empty space", () => {
    const a = rect({ id: "a", x: 0, y: 0, width: 100, height: 100 })
    expect(bindingTargetAt({ x: 500, y: 500 }, [a])).toBeNull()
  })
  it("skips a note's bound text child", () => {
    const text = { ...newText({ x: 0, y: 0 }), id: "t", width: 100, height: 100, containerId: "c" }
    expect(bindingTargetAt({ x: 10, y: 10 }, [text])).toBeNull()
  })
})

describe("computeBoundEndpoint", () => {
  it("places the endpoint on the rect edge plus gap, toward the other end", () => {
    const target = rect({ x: 0, y: 0, width: 100, height: 100 }) // center (50,50)
    const p = computeBoundEndpoint(target, { x: 1000, y: 50 }, BINDING_GAP)
    expect(p.x).toBeCloseTo(100 + BINDING_GAP)
    expect(p.y).toBeCloseTo(50)
  })
})
