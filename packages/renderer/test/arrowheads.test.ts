import type { Arrowhead } from "@excalidraw-clone/scene"
import { newArrow, newLine } from "@excalidraw-clone/scene"
import { RoughGenerator } from "roughjs/bin/generator"
import { describe, expect, it, vi } from "vitest"
import { arrowShape, lineShape } from "../src/shapes"
import { arrowheadDrawables } from "../src/shapes/arrowheads"

const TIP: [number, number] = [100, 50]
const PREV: [number, number] = [0, 50] // horizontal shaft pointing right
const OPTS = { stroke: "#1e1e1e", strokeWidth: 2, seed: 7 }

const run = (kind: Arrowhead) => {
  const gen = new RoughGenerator()
  const spies = {
    linearPath: vi.spyOn(gen, "linearPath"),
    polygon: vi.spyOn(gen, "polygon"),
    circle: vi.spyOn(gen, "circle"),
    line: vi.spyOn(gen, "line"),
  }
  const drawables = arrowheadDrawables(kind, TIP, PREV, gen, OPTS)
  return { spies, drawables }
}

describe("arrowheadDrawables", () => {
  it("arrow → one open chevron via linearPath through the tip", () => {
    const { spies, drawables } = run("arrow")
    expect(drawables.length).toBe(1)
    expect(spies.linearPath).toHaveBeenCalledOnce()
    const [pts, opts] = spies.linearPath.mock.calls[0]!
    expect(pts).toHaveLength(3)
    expect(pts[1]).toEqual([100, 50]) // tip is the middle point
    expect(opts?.fill).toBeUndefined()
  })

  it("triangle → filled polygon with a vertex at the tip", () => {
    const { spies } = run("triangle")
    expect(spies.polygon).toHaveBeenCalledOnce()
    const [pts, opts] = spies.polygon.mock.calls[0]!
    expect(pts[0]).toEqual([100, 50])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("triangle_outline → same polygon, no fill", () => {
    const { spies } = run("triangle_outline")
    expect(spies.polygon).toHaveBeenCalledOnce()
    expect(spies.polygon.mock.calls[0]?.[1]?.fill).toBeUndefined()
  })

  it("bar → one perpendicular segment centered on the tip", () => {
    const { spies } = run("bar")
    expect(spies.line).toHaveBeenCalledOnce()
    const [x1, y1, x2, y2] = spies.line.mock.calls[0]!
    // shaft is horizontal → bar is vertical through the tip
    expect(x1).toBeCloseTo(100)
    expect(x2).toBeCloseTo(100)
    expect(y1).toBeCloseTo(40)
    expect(y2).toBeCloseTo(60)
  })

  it("dot → filled circle centered on the tip, diameter 12", () => {
    const { spies } = run("dot")
    expect(spies.circle).toHaveBeenCalledOnce()
    const [cx, cy, d, opts] = spies.circle.mock.calls[0]!
    expect([cx, cy, d]).toEqual([100, 50, 12])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("circle → filled circle centered on the tip, diameter 16", () => {
    const { spies } = run("circle")
    expect(spies.circle).toHaveBeenCalledOnce()
    const [cx, cy, d, opts] = spies.circle.mock.calls[0]!
    expect([cx, cy, d]).toEqual([100, 50, 16])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("circle_outline → same circle, no fill", () => {
    const { spies } = run("circle_outline")
    expect(spies.circle).toHaveBeenCalledOnce()
    const [cx, cy, d, opts] = spies.circle.mock.calls[0]!
    expect([cx, cy, d]).toEqual([100, 50, 16])
    expect(opts?.fill).toBeUndefined()
  })

  it("cross → two segments crossing at the tip", () => {
    const { spies, drawables } = run("cross")
    expect(spies.line).toHaveBeenCalledTimes(2)
    expect(drawables.length).toBe(2)
    // both segments have the tip as midpoint
    for (const call of spies.line.mock.calls) {
      const [x1, y1, x2, y2] = call
      expect((Number(x1) + Number(x2)) / 2).toBeCloseTo(100)
      expect((Number(y1) + Number(y2)) / 2).toBeCloseTo(50)
    }
  })

  it("diamond → filled 4-gon with far vertex at the tip", () => {
    const { spies } = run("diamond")
    expect(spies.polygon).toHaveBeenCalledOnce()
    const [pts, opts] = spies.polygon.mock.calls[0]!
    expect(pts).toHaveLength(4)
    expect(pts[0]).toEqual([100, 50])
    expect(opts?.fill).toBe("#1e1e1e")
    expect(opts?.fillStyle).toBe("solid")
  })

  it("diamond_outline → same 4-gon, no fill", () => {
    const { spies } = run("diamond_outline")
    expect(spies.polygon).toHaveBeenCalledOnce()
    expect(spies.polygon.mock.calls[0]?.[0]).toHaveLength(4)
    expect(spies.polygon.mock.calls[0]?.[1]?.fill).toBeUndefined()
  })

  it("every kind produces at least one drawable", () => {
    const kinds: Arrowhead[] = [
      "arrow",
      "bar",
      "dot",
      "circle",
      "cross",
      "triangle",
      "diamond",
      "triangle_outline",
      "circle_outline",
      "diamond_outline",
    ]
    for (const kind of kinds) {
      expect(run(kind).drawables.length).toBeGreaterThan(0)
    }
  })

  it("all kinds inherit strokeLineDash from opts", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    arrowheadDrawables("arrow", TIP, PREV, gen, { ...OPTS, strokeLineDash: [8, 8] })
    expect(spy.mock.calls[0]?.[1]?.strokeLineDash).toEqual([8, 8])
  })
})

const twoPoints = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
]

describe("arrowShape arrowhead kinds", () => {
  it("endArrowhead 'triangle' → polygon at the end tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "polygon")
    const e = { ...newArrow({ x: 0, y: 0 }), points: twoPoints, endArrowhead: "triangle" as const }
    arrowShape(e, gen)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[0]?.[0]).toEqual([100, 0])
  })

  it("startArrowhead 'dot' → circle at the start tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "circle")
    const e = {
      ...newArrow({ x: 0, y: 0 }),
      points: twoPoints,
      startArrowhead: "dot" as const,
      endArrowhead: null,
    }
    arrowShape(e, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [cx, cy] = spy.mock.calls[0]!
    expect([cx, cy]).toEqual([0, 0])
  })

  it("default arrow (end 'arrow', start null) → shaft + one chevron", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "linearPath")
    const e = { ...newArrow({ x: 0, y: 0 }), points: twoPoints }
    arrowShape(e, gen)
    expect(spy).toHaveBeenCalledTimes(2) // shaft + chevron
  })
})

describe("lineShape arrowheads", () => {
  it("no arrowheads (default) → single linearPath, nothing else", () => {
    const gen = new RoughGenerator()
    const lp = vi.spyOn(gen, "linearPath")
    const l = { ...newLine({ x: 0, y: 0 }), points: twoPoints }
    lineShape(l, gen)
    expect(lp).toHaveBeenCalledOnce()
  })

  it("endArrowhead 'bar' → perpendicular segment at the end tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "line")
    const l = { ...newLine({ x: 0, y: 0 }), points: twoPoints, endArrowhead: "bar" as const }
    lineShape(l, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [x1, , x2] = spy.mock.calls[0]!
    expect(x1).toBeCloseTo(100)
    expect(x2).toBeCloseTo(100)
  })

  it("startArrowhead 'circle_outline' → outline circle at the start tip", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "circle")
    const l = {
      ...newLine({ x: 0, y: 0 }),
      points: twoPoints,
      startArrowhead: "circle_outline" as const,
    }
    lineShape(l, gen)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]?.[3]?.fill).toBeUndefined()
  })
})
