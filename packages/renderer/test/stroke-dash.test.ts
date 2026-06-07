import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { rectangleOptions } from "../src/shapes/rectangle"
import { strokeLineDash } from "../src/shapes/stroke-dash"

describe("strokeLineDash", () => {
  it("solid → no dashes", () => {
    expect(strokeLineDash("solid")).toEqual([])
  })
  it("dashed → [8,8]", () => {
    expect(strokeLineDash("dashed")).toEqual([8, 8])
  })
  it("dotted → [2,6]", () => {
    expect(strokeLineDash("dotted")).toEqual([2, 6])
  })
})

describe("shape options carry strokeLineDash", () => {
  it("dashed rectangle passes [8,8]", () => {
    const r = {
      ...newRectangle({ x: 0, y: 0, width: 5, height: 5 }),
      strokeStyle: "dashed" as const,
    }
    expect(rectangleOptions(r).strokeLineDash).toEqual([8, 8])
  })
  it("solid rectangle passes []", () => {
    const r = newRectangle({ x: 0, y: 0, width: 5, height: 5 })
    expect(rectangleOptions(r).strokeLineDash).toEqual([])
  })
})
