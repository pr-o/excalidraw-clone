import { describe, expect, it } from "vitest"
import { newLine, newRectangle } from "../src/factories"
import { describeHistoryChange } from "../src/describe-history-change"

describe("describeHistoryChange — initial entry", () => {
  it("returns 'initial' with the live element count when prev is undefined", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(describeHistoryChange(undefined, [a])).toEqual({ category: "initial", count: 1 })
  })

  it("initial count excludes soft-deleted elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const deleted = { ...newRectangle({ x: 5, y: 5, width: 10, height: 10 }), isDeleted: true }
    expect(describeHistoryChange(undefined, [a, deleted])).toEqual({
      category: "initial",
      count: 1,
    })
  })
})

describe("describeHistoryChange — single-category transitions", () => {
  it("detects an added element", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(describeHistoryChange([], [a])).toEqual({ category: "added", count: 1 })
  })

  it("detects a removed (soft-deleted) element", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const deleted = { ...a, isDeleted: true }
    expect(describeHistoryChange([a], [deleted])).toEqual({ category: "removed", count: 1 })
  })

  it("detects a moved element (position translated, size/style unchanged)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const moved = { ...a, x: 10, y: 5 }
    expect(describeHistoryChange([a], [moved])).toEqual({ category: "moved", count: 1 })
  })

  it("detects a resized element (size changed)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const resized = { ...a, width: 20 }
    expect(describeHistoryChange([a], [resized])).toEqual({ category: "resized", count: 1 })
  })

  it("detects a restyled element (only a style field changed)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const restyled = { ...a, strokeColor: "#ff0000" }
    expect(describeHistoryChange([a], [restyled])).toEqual({ category: "restyled", count: 1 })
  })

  it("counts multiple elements changed the same way", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const movedA = { ...a, x: 100 }
    const movedB = { ...b, x: 120 }
    expect(describeHistoryChange([a, b], [movedA, movedB])).toEqual({
      category: "moved",
      count: 2,
    })
  })
})

describe("describeHistoryChange — reorder", () => {
  it("detects a z-order-only change (same fields, different array order)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    expect(describeHistoryChange([a, b], [b, a])).toEqual({ category: "reordered", count: 2 })
  })

  it("does not misclassify as reorder when order changed AND a field also changed", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const movedB = { ...b, x: 200 }
    expect(describeHistoryChange([a, b], [movedB, a])).toEqual({ category: "moved", count: 1 })
  })
})

describe("describeHistoryChange — fallback to 'modified'", () => {
  it("falls back when categories differ across changed elements", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newRectangle({ x: 20, y: 0, width: 10, height: 10 })
    const movedA = { ...a, x: 100 }
    const resizedB = { ...b, width: 30 }
    expect(describeHistoryChange([a, b], [movedA, resizedB])).toEqual({
      category: "modified",
      count: 2,
    })
  })

  it("falls back when a non-geometry/style field changes (e.g. locked)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const locked = { ...a, locked: true }
    expect(describeHistoryChange([a], [locked])).toEqual({ category: "modified", count: 1 })
  })

  it("falls back when one element's geometry AND style change together", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const both = { ...a, x: 50, strokeColor: "#00ff00" }
    expect(describeHistoryChange([a], [both])).toEqual({ category: "modified", count: 1 })
  })

  it("ignores versionNonce/updated differences on their own (no-op mutation is unreachable in practice, but the ignore rule itself is directly testable)", () => {
    const a = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const touched = { ...a, versionNonce: a.versionNonce + 1, updated: a.updated + 1000 }
    // Same id set, all non-volatile fields equal, same order -> not a reorder either.
    expect(describeHistoryChange([a], [touched])).toEqual({ category: "modified", count: 0 })
  })
})

describe("describeHistoryChange — linear element points", () => {
  const asLine = (points: { x: number; y: number }[]) => ({
    ...newLine({ x: 0, y: 0, width: 10, height: 10 }),
    points,
  })

  it("classifies a pure-translation points change as moved", () => {
    const a = asLine([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])
    const moved = {
      ...a,
      x: a.x + 5,
      y: a.y + 5,
      points: a.points.map((p) => ({ x: p.x + 5, y: p.y + 5 })),
    }
    expect(describeHistoryChange([a], [moved])).toEqual({ category: "moved", count: 1 })
  })

  it("classifies a non-uniform points change as resized", () => {
    const a = asLine([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])
    const resized = {
      ...a,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 30 },
      ],
      width: 20,
      height: 30,
    }
    expect(describeHistoryChange([a], [resized])).toEqual({ category: "resized", count: 1 })
  })
})
