import { newFrame, newRectangle, newText } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  collectSearchableItems,
  filterMatches,
  isSelectableMatch,
  type SearchableItem,
} from "../src/driver/findMatches"

describe("collectSearchableItems", () => {
  it("includes a text element's text", () => {
    const text = newText({ x: 0, y: 0, text: "Hello World" })
    expect(collectSearchableItems([text])).toEqual([{ id: text.id, label: "Hello World" }])
  })

  it("includes a frame's non-null name", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 80, name: "Login flow" })
    expect(collectSearchableItems([frame])).toEqual([{ id: frame.id, label: "Login flow" }])
  })

  it("excludes a frame with a null name", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 80 })
    expect(frame.name).toBeNull()
    expect(collectSearchableItems([frame])).toEqual([])
  })

  it("excludes a text element with empty or whitespace-only text", () => {
    const empty = newText({ x: 0, y: 0, text: "" })
    const blank = newText({ x: 0, y: 0, text: "   " })
    expect(collectSearchableItems([empty, blank])).toEqual([])
  })

  it("excludes a frame with a whitespace-only name", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 80, name: "   " })
    expect(collectSearchableItems([frame])).toEqual([])
  })

  it("contributes nothing for a non-text, non-frame element", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(collectSearchableItems([rect])).toEqual([])
  })

  it("excludes deleted text and frame elements", () => {
    const text = { ...newText({ x: 0, y: 0, text: "gone" }), isDeleted: true }
    const frame = {
      ...newFrame({ x: 0, y: 0, width: 100, height: 80, name: "gone too" }),
      isDeleted: true,
    }
    expect(collectSearchableItems([text, frame])).toEqual([])
  })

  it("includes a bound label (text element with a containerId)", () => {
    const rect = newRectangle({ x: 0, y: 0, width: 100, height: 60 })
    const label = newText({ x: 10, y: 10, text: "Start", containerId: rect.id })
    expect(label.containerId).toBe(rect.id)
    expect(collectSearchableItems([rect, label])).toEqual([{ id: label.id, label: "Start" }])
  })

  it("collects several elements, preserving input order", () => {
    const a = newText({ x: 0, y: 0, text: "alpha" })
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const b = newFrame({ x: 0, y: 0, width: 100, height: 80, name: "beta" })
    expect(collectSearchableItems([a, rect, b])).toEqual([
      { id: a.id, label: "alpha" },
      { id: b.id, label: "beta" },
    ])
  })
})

describe("filterMatches", () => {
  const items: SearchableItem[] = [
    { id: "1", label: "Hello World" },
    { id: "2", label: "hello again" },
    { id: "3", label: "Something else" },
  ]

  it("matches case-insensitively on a substring", () => {
    expect(filterMatches([{ id: "1", label: "Hello World" }], "hello")).toEqual([
      { id: "1", label: "Hello World" },
    ])
    expect(filterMatches([{ id: "1", label: "Hello World" }], "WOR")).toEqual([
      { id: "1", label: "Hello World" },
    ])
  })

  it("returns [] for an empty query", () => {
    expect(filterMatches(items, "")).toEqual([])
  })

  it("returns [] for a whitespace-only query", () => {
    expect(filterMatches(items, "   ")).toEqual([])
  })

  it("returns [] when nothing matches", () => {
    expect(filterMatches(items, "zzz")).toEqual([])
  })

  it("returns every match, preserving input order", () => {
    expect(filterMatches(items, "hello")).toEqual([
      { id: "1", label: "Hello World" },
      { id: "2", label: "hello again" },
    ])
  })
})

describe("isSelectableMatch", () => {
  it("returns true for an unlocked element", () => {
    expect(isSelectableMatch(newRectangle({ x: 0, y: 0 }))).toBe(true)
  })

  it("returns false for a locked element", () => {
    expect(isSelectableMatch({ ...newRectangle({ x: 0, y: 0 }), locked: true })).toBe(false)
  })
})
