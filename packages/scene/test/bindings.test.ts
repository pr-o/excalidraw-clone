import { describe, expect, it } from "vitest"
import type { Point } from "@excalidraw-clone/geometry"
import { newArrow, newEllipse, newRectangle, newText } from "../src/factories"
import {
  BINDABLE_TYPES,
  BINDING_GAP,
  bindingTargetAt,
  canBindTo,
  computeBoundEndpoint,
  computeFocus,
  reconcileBindings,
} from "../src/bindings"
import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawRectangleElement,
} from "../src/types"

const rect = (over: Partial<ExcalidrawRectangleElement>): ExcalidrawElement => ({
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

  it("focus shifts the attach point perpendicular to the toward direction", () => {
    const target = rect({ x: 0, y: 0, width: 100, height: 100 }) // center (50,50)
    // toward far to the right → dir ≈ (1,0), perp ≈ (0,1), halfPerp = height/2 = 50
    const centered = computeBoundEndpoint(target, { x: 1000, y: 50 }, 0, 0)
    const shifted = computeBoundEndpoint(target, { x: 1000, y: 50 }, 0, 0.5)
    expect(centered.y).toBeCloseTo(50)
    // focus 0.5 → +0.5 * 50 = +25 in the perpendicular (down) direction
    expect(shifted.y).toBeCloseTo(75)
    expect(shifted.x).toBeCloseTo(centered.x)
  })
})

describe("computeFocus", () => {
  const target = rect({ x: 0, y: 0, width: 100, height: 100 }) // center (50,50)

  it("returns 0 for a centered endpoint", () => {
    expect(computeFocus(target, { x: 100, y: 50 }, { x: 1000, y: 50 })).toBeCloseTo(0)
  })

  it("round-trips: focus from a dropped point reproduces that point's offset", () => {
    const toward = { x: 1000, y: 50 } // dir ≈ (1,0), perp ≈ (0,1)
    const dropped = { x: 104, y: 75 } // 25 below center → focus 0.5
    const focus = computeFocus(target, dropped, toward)
    expect(focus).toBeCloseTo(0.5)
    const reproduced = computeBoundEndpoint(target, toward, 4, focus)
    expect(reproduced.y).toBeCloseTo(dropped.y)
  })

  it("clamps to [-1, 1]", () => {
    expect(computeFocus(target, { x: 100, y: 500 }, { x: 1000, y: 50 })).toBe(1)
    expect(computeFocus(target, { x: 100, y: -500 }, { x: 1000, y: 50 })).toBe(-1)
  })
})

const boundArrow = (over: Partial<ExcalidrawArrowElement>): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  width: 100,
  height: 0,
  ...over,
})

const absEnd = (a: ExcalidrawArrowElement): Point => ({
  x: a.x + a.points[a.points.length - 1]!.x,
  y: a.y + a.points[a.points.length - 1]!.y,
})

describe("reconcileBindings", () => {
  it("follows a moved target (end bound to a rect)", () => {
    const target = rect({ id: "t", x: 200, y: 0, width: 100, height: 100 })
    const arrow = boundArrow({
      id: "ar",
      x: 0,
      y: 50,
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const ar1 = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    const endX1 = absEnd(ar1).x

    // Move the target +300 in x.
    const ti = draft.findIndex((e) => e.id === "t")
    draft[ti] = { ...draft[ti]!, x: 500 }
    reconcileBindings(draft)
    const ar2 = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(absEnd(ar2).x).toBeGreaterThan(endX1)
  })

  it("is idempotent", () => {
    const target = rect({ id: "t", x: 200, y: 0, width: 100, height: 100 })
    const arrow = boundArrow({
      id: "ar",
      x: 0,
      y: 50,
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const once = absEnd(draft.find((e) => e.id === "ar") as ExcalidrawArrowElement)
    reconcileBindings(draft)
    const twice = absEnd(draft.find((e) => e.id === "ar") as ExcalidrawArrowElement)
    expect(twice.x).toBeCloseTo(once.x)
    expect(twice.y).toBeCloseTo(once.y)
  })

  it("clears a binding whose target is missing", () => {
    const arrow = boundArrow({
      id: "ar",
      endBinding: { elementId: "gone", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [arrow]
    reconcileBindings(draft)
    const ar = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(ar.endBinding).toBeNull()
  })

  it("clears a binding whose target is deleted", () => {
    const target = rect({ id: "t", x: 200, y: 0, width: 100, height: 100, isDeleted: true })
    const arrow = boundArrow({
      id: "ar",
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [target, arrow]
    reconcileBindings(draft)
    const ar = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    expect(ar.endBinding).toBeNull()
  })

  it("resolves both ends bound to two rects in one pass", () => {
    const a = rect({ id: "a", x: 0, y: 0, width: 100, height: 100 })
    const b = rect({ id: "b", x: 400, y: 0, width: 100, height: 100 })
    const arrow = boundArrow({
      id: "ar",
      startBinding: { elementId: "a", focus: 0, gap: BINDING_GAP },
      endBinding: { elementId: "b", focus: 0, gap: BINDING_GAP },
    })
    const draft: ExcalidrawElement[] = [a, b, arrow]
    reconcileBindings(draft)
    const ar = draft.find((e) => e.id === "ar") as ExcalidrawArrowElement
    const start = { x: ar.x + ar.points[0]!.x, y: ar.y + ar.points[0]!.y }
    // start sits just right of rect A's right edge (x=100), end just left of B (x=400)
    expect(start.x).toBeCloseTo(100 + BINDING_GAP)
    expect(absEnd(ar).x).toBeCloseTo(400 - BINDING_GAP)
  })
})
