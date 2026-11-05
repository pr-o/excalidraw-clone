import { describe, expect, it } from "vitest"
import { measureGaps } from "../src/measure"

const sel = { x: 100, y: 100, width: 100, height: 50 } // right 200, bottom 150

describe("measureGaps", () => {
  it("measures to the nearest neighbour on each side, through the middle of the overlap", () => {
    const out = measureGaps(sel, [
      { x: 240, y: 120, width: 50, height: 100 }, // right, gap 40, y-overlap 120..150
      { x: 300, y: 100, width: 50, height: 50 }, // right, farther
      { x: 20, y: 100, width: 50, height: 50 }, // left, gap 30
      { x: 100, y: 10, width: 40, height: 60 }, // top, gap 30, x-overlap 100..140
      { x: 150, y: 175, width: 100, height: 20 }, // bottom, gap 25, x-overlap 150..200
    ])
    expect(out).toEqual([
      { side: "left", axis: "x", from: 70, to: 100, at: 125, distance: 30 },
      { side: "right", axis: "x", from: 200, to: 240, at: 135, distance: 40 },
      { side: "top", axis: "y", from: 70, to: 100, at: 120, distance: 30 },
      { side: "bottom", axis: "y", from: 150, to: 175, at: 175, distance: 25 },
    ])
  })

  it("ignores boxes that do not line up with the selection on the other axis", () => {
    // Diagonal neighbours: beyond the right edge but entirely below.
    expect(measureGaps(sel, [{ x: 250, y: 300, width: 50, height: 50 }])).toEqual([])
    // Merely touching on the other axis is not overlap.
    expect(measureGaps(sel, [{ x: 250, y: 150, width: 50, height: 50 }])).toEqual([])
  })

  it("ignores intersecting boxes and touching ones", () => {
    expect(
      measureGaps(sel, [
        { x: 150, y: 120, width: 100, height: 10 }, // crosses the right edge
        { x: 200, y: 100, width: 50, height: 50 }, // touches the right edge
      ]),
    ).toEqual([])
  })

  it("measures to the inner edges of a box that contains the selection", () => {
    const frame = { x: 80, y: 60, width: 200, height: 140 } // right 280, bottom 200
    expect(measureGaps(sel, [frame])).toEqual([
      { side: "left", axis: "x", from: 80, to: 100, at: 125, distance: 20 },
      { side: "right", axis: "x", from: 200, to: 280, at: 125, distance: 80 },
      { side: "top", axis: "y", from: 60, to: 100, at: 150, distance: 40 },
      { side: "bottom", axis: "y", from: 150, to: 200, at: 150, distance: 50 },
    ])
  })

  it("prefers a neighbour inside the frame over the frame's own edge", () => {
    const frame = { x: 0, y: 0, width: 500, height: 500 }
    const inside = { x: 230, y: 100, width: 20, height: 20 }
    const right = measureGaps(sel, [frame, inside]).find((m) => m.side === "right")
    expect(right?.distance).toBe(30)
  })
})
