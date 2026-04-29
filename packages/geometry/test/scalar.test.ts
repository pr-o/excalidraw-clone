import { describe, expect, it } from "vitest"
import { clamp, degToRad, lerp, radToDeg } from "../src"

describe("clamp", () => {
  it.each<[number, number, number, number]>([
    [5, 0, 10, 5],
    [-1, 0, 10, 0],
    [11, 0, 10, 10],
    [0, 0, 10, 0],
    [10, 0, 10, 10],
    [-5, -10, -1, -5],
    [-20, -10, -1, -10],
  ])("clamp(%d, %d, %d) === %d", (v, min, max, expected) => {
    expect(clamp(v, min, max)).toBe(expected)
  })
})

describe("lerp", () => {
  it.each<[number, number, number, number]>([
    [0, 10, 0, 0],
    [0, 10, 1, 10],
    [0, 10, 0.5, 5],
    [0, 10, 2, 20],
    [0, 10, -1, -10],
    [-5, 5, 0.5, 0],
    [3, 3, 0.7, 3],
  ])("lerp(%d, %d, %d) === %d", (a, b, t, expected) => {
    expect(lerp(a, b, t)).toBeCloseTo(expected)
  })
})

describe("degToRad / radToDeg", () => {
  it.each<[number, number]>([
    [0, 0],
    [90, Math.PI / 2],
    [180, Math.PI],
    [-90, -Math.PI / 2],
    [360, 2 * Math.PI],
    [45, Math.PI / 4],
  ])("degToRad(%d) ≈ %d", (deg, rad) => {
    expect(degToRad(deg)).toBeCloseTo(rad)
  })

  it("radToDeg is the inverse of degToRad", () => {
    for (const deg of [0, 30, 45, 90, 180, -45, 360.5]) {
      expect(radToDeg(degToRad(deg))).toBeCloseTo(deg)
    }
  })
})
