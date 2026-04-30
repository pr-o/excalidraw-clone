import { newArrow, newDiamond, newEllipse, newLine } from "@excalidraw-clone/scene"
import { RoughGenerator } from "roughjs/bin/generator"
import { describe, expect, it, vi } from "vitest"
import { arrowShape, diamondShape, ellipseShape, lineShape } from "../src/shapes"

describe("ellipseShape", () => {
  it("calls gen.ellipse with center + size + seed", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "ellipse")
    const e = { ...newEllipse({ x: 0, y: 0, width: 40, height: 30 }) }
    ellipseShape(e, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [cx, cy, w, h, opts] = spy.mock.calls[0]!
    expect(cx).toBe(20)
    expect(cy).toBe(15)
    expect(w).toBe(40)
    expect(h).toBe(30)
    expect(opts?.seed).toBe(e.seed)
  })

  it("transparent backgroundColor → no fill option", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "ellipse")
    ellipseShape({ ...newEllipse({ x: 0, y: 0 }) }, gen)
    expect(spy.mock.calls[0]?.[4]?.fill).toBeUndefined()
  })
})

describe("diamondShape", () => {
  it("calls gen.polygon with 4 mid-edge points", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "polygon")
    const d = { ...newDiamond({ x: 0, y: 0, width: 40, height: 30 }) }
    diamondShape(d, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [points] = spy.mock.calls[0]!
    expect(points).toEqual([
      [20, 0],
      [40, 15],
      [20, 30],
      [0, 15],
    ])
  })
})

describe("lineShape", () => {
  it("calls gen.linearPath with the polyline", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const l = {
      ...newLine({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
    }
    lineShape(l, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [pts] = spy.mock.calls[0]!
    expect(pts).toEqual([
      [0, 0],
      [10, 5],
    ])
  })

  it("returns no drawables for fewer than 2 points", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const l = { ...newLine({ x: 0, y: 0 }), points: [{ x: 0, y: 0 }] }
    expect(lineShape(l, gen)).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("arrowShape", () => {
  it("draws polyline + end arrowhead by default", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const a = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    }
    arrowShape(a, gen)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("no arrowhead when endArrowhead is null and startArrowhead is null", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const a = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      startArrowhead: null,
      endArrowhead: null,
    }
    arrowShape(a, gen)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("renders both start and end arrowheads when both set", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const a = {
      ...newArrow({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      startArrowhead: "arrow" as const,
      endArrowhead: "arrow" as const,
    }
    arrowShape(a, gen)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it("returns no drawables for fewer than 2 points", () => {
    const gen = new RoughGenerator()
    const a = { ...newArrow({ x: 0, y: 0 }) }
    expect(arrowShape(a, gen)).toEqual([])
  })
})
