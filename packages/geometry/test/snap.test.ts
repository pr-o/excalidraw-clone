import { describe, expect, it } from "vitest"
import { snapPointToGrid } from "../src/snap"

const ON: { enabled: true; size: number } = { enabled: true, size: 20 }
const NO_MODS = { ctrl: false, meta: false }

describe("snapPointToGrid", () => {
  it("returns the input unchanged when grid is disabled", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, { enabled: false, size: 20 }, NO_MODS)).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("returns the input unchanged when size is zero or negative", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, { enabled: true, size: 0 }, NO_MODS)).toEqual({
      x: 13,
      y: 27,
    })
    expect(snapPointToGrid({ x: 13, y: 27 }, { enabled: true, size: -5 }, NO_MODS)).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("returns the input unchanged when ctrl is held", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, ON, { ctrl: true, meta: false })).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("returns the input unchanged when meta is held", () => {
    expect(snapPointToGrid({ x: 13, y: 27 }, ON, { ctrl: false, meta: true })).toEqual({
      x: 13,
      y: 27,
    })
  })

  it("rounds positive coords to the nearest grid intersection", () => {
    expect(snapPointToGrid({ x: 9, y: 11 }, ON, NO_MODS)).toEqual({ x: 0, y: 20 })
    expect(snapPointToGrid({ x: 21, y: 29 }, ON, NO_MODS)).toEqual({ x: 20, y: 20 })
  })

  it("rounds negative coords toward positive infinity (Math.round semantics)", () => {
    expect(snapPointToGrid({ x: -30, y: -50 }, ON, NO_MODS)).toEqual({ x: -20, y: -40 })
  })

  it("rounds half-grid boundary toward positive infinity", () => {
    expect(snapPointToGrid({ x: 10, y: -10 }, ON, NO_MODS)).toEqual({ x: 20, y: 0 })
  })
})
