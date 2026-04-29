import { describe, expect, it } from "vitest"
import {
  hitTestElement,
  newDiamond,
  newEllipse,
  newFreedraw,
  newFrame,
  newImage,
  newLine,
  newRectangle,
  newText,
} from "../src"
import type { ExcalidrawFreedrawElement, ExcalidrawLineElement } from "../src"

describe("hitTestElement — shapes", () => {
  it("rectangle: inside, on edge, outside", () => {
    const r = newRectangle({ x: 0, y: 0, width: 100, height: 50 })
    expect(hitTestElement(r, { x: 50, y: 25 })).toBe(true)
    expect(hitTestElement(r, { x: 0, y: 0 })).toBe(true)
    expect(hitTestElement(r, { x: 100, y: 50 })).toBe(true)
    expect(hitTestElement(r, { x: -1, y: 25 })).toBe(false)
    expect(hitTestElement(r, { x: 200, y: 25 })).toBe(false)
  })

  it("rotated rectangle: pointer inside AABB but outside rotated shape misses", () => {
    const r = { ...newRectangle({ x: 0, y: 0, width: 100, height: 20, angle: Math.PI / 4 }) }
    expect(hitTestElement(r, { x: 50, y: 10 })).toBe(true)
    expect(hitTestElement(r, { x: -20, y: 5 })).toBe(false)
  })

  it("ellipse: inside vs outside the inscribed ellipse", () => {
    const e = newEllipse({ x: 0, y: 0, width: 100, height: 50 })
    expect(hitTestElement(e, { x: 50, y: 25 })).toBe(true)
    expect(hitTestElement(e, { x: 0, y: 0 })).toBe(false)
    expect(hitTestElement(e, { x: 99, y: 25 })).toBe(true)
  })

  it("diamond: inside vs outside the rhombus", () => {
    const d = newDiamond({ x: 0, y: 0, width: 100, height: 50 })
    expect(hitTestElement(d, { x: 50, y: 25 })).toBe(true)
    expect(hitTestElement(d, { x: 0, y: 0 })).toBe(false)
    expect(hitTestElement(d, { x: 50, y: 0 })).toBe(true)
  })

  it("text/image/frame use rectangular hit test", () => {
    const t = { ...newText({ x: 0, y: 0, width: 100, height: 20 }) }
    expect(hitTestElement(t, { x: 50, y: 10 })).toBe(true)
    expect(hitTestElement(t, { x: 200, y: 10 })).toBe(false)

    const img = { ...newImage({ x: 0, y: 0, width: 100, height: 100 }) }
    expect(hitTestElement(img, { x: 50, y: 50 })).toBe(true)
    expect(hitTestElement(img, { x: 200, y: 200 })).toBe(false)

    const fr = { ...newFrame({ x: 0, y: 0, width: 100, height: 100 }) }
    expect(hitTestElement(fr, { x: 50, y: 50 })).toBe(true)
  })
})

describe("hitTestElement — linear elements", () => {
  it("line: pointer within strokeWidth threshold of segment hits", () => {
    const base = newLine({ x: 0, y: 0 })
    const l: ExcalidrawLineElement = {
      ...base,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    expect(hitTestElement(l, { x: 50, y: 0 })).toBe(true)
    expect(hitTestElement(l, { x: 50, y: 4 })).toBe(true)
    expect(hitTestElement(l, { x: 50, y: 50 })).toBe(false)
  })

  it("arrow: same segment-based hit test", () => {
    const base = newLine({ x: 5, y: 5 })
    const a: ExcalidrawLineElement = {
      ...base,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    }
    expect(hitTestElement(a, { x: 10, y: 10 })).toBe(true)
    expect(hitTestElement(a, { x: 100, y: 100 })).toBe(false)
  })

  it("freedraw with three points: hits midpoint of any segment", () => {
    const base = newFreedraw({ x: 0, y: 0 })
    const f: ExcalidrawFreedrawElement = {
      ...base,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
    }
    expect(hitTestElement(f, { x: 25, y: 0 })).toBe(true)
    expect(hitTestElement(f, { x: 50, y: 25 })).toBe(true)
    expect(hitTestElement(f, { x: 100, y: 100 })).toBe(false)
  })

  it("threshold override widens the hit area", () => {
    const base = newLine({ x: 0, y: 0 })
    const l: ExcalidrawLineElement = {
      ...base,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }
    expect(hitTestElement(l, { x: 50, y: 20 })).toBe(false)
    expect(hitTestElement(l, { x: 50, y: 20 }, { threshold: 30 })).toBe(true)
  })

  it("empty-points polyline never hits", () => {
    const f = newFreedraw({ x: 0, y: 0 })
    expect(hitTestElement(f, { x: 0, y: 0 })).toBe(false)
  })
})

describe("hitTestElement — deleted elements", () => {
  it("never hits a deleted element", () => {
    const r = { ...newRectangle({ x: 0, y: 0, width: 100, height: 100 }), isDeleted: true }
    expect(hitTestElement(r, { x: 50, y: 50 })).toBe(false)
  })
})
