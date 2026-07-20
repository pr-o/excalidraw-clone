import { describe, expect, it } from "vitest"
import { newArrow } from "../src"
import { routeElbow, sideCenter, sideOf } from "../src/elbow"

const orthogonal = (pts: readonly { x: number; y: number }[]): boolean => {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (a.x !== b.x && a.y !== b.y) return false
  }
  return true
}

describe("sideOf / sideCenter", () => {
  it("picks the dominant axis, preferring horizontal on ties", () => {
    expect(sideOf({ x: 0, y: 0 }, { x: 10, y: 3 })).toBe("right")
    expect(sideOf({ x: 0, y: 0 }, { x: -10, y: 3 })).toBe("left")
    expect(sideOf({ x: 0, y: 0 }, { x: 2, y: 9 })).toBe("bottom")
    expect(sideOf({ x: 0, y: 0 }, { x: 2, y: -9 })).toBe("top")
    expect(sideOf({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe("right")
  })

  it("sideCenter pushes the side midpoint out by gap", () => {
    const b = { x: 0, y: 0, width: 100, height: 60 }
    expect(sideCenter(b, "right", 4)).toEqual({ x: 104, y: 30 })
    expect(sideCenter(b, "top", 4)).toEqual({ x: 50, y: -4 })
    expect(sideCenter(b, "bottom", 0)).toEqual({ x: 50, y: 60 })
  })
})

describe("routeElbow", () => {
  it("opposite horizontal sides route as a Z through the mid corridor", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 296, y: 250 }, "right", "left")
    expect(orthogonal(pts)).toBe(true)
    expect(pts[0]).toEqual({ x: 104, y: 50 })
    expect(pts[pts.length - 1]).toEqual({ x: 296, y: 250 })
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 250 },
      { x: 296, y: 250 },
    ])
  })

  it("aligned opposite sides collapse to a straight segment", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 296, y: 50 }, "right", "left")
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 296, y: 50 },
    ])
  })

  it("perpendicular sides route as an L", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 300, y: 196 }, "right", "top")
    expect(orthogonal(pts)).toBe(true)
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 196 },
    ])
  })

  it("same-side exits route as a U outside both stubs", () => {
    const pts = routeElbow({ x: 104, y: 50 }, { x: 204, y: 150 }, "right", "right")
    expect(orthogonal(pts)).toBe(true)
    // outer corridor at max(104,204) + 16 = 220
    expect(pts).toEqual([
      { x: 104, y: 50 },
      { x: 220, y: 50 },
      { x: 220, y: 150 },
      { x: 204, y: 150 },
    ])
  })

  it("unbound endpoints route a plain L on the dominant axis", () => {
    const pts = routeElbow({ x: 0, y: 0 }, { x: 100, y: 40 }, null, null)
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
    ])
  })

  it("newArrow defaults elbowed to false and accepts elbowed: true", () => {
    expect(newArrow({ x: 0, y: 0 }).elbowed).toBe(false)
    expect(newArrow({ x: 0, y: 0, elbowed: true }).elbowed).toBe(true)
  })
})
