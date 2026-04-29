import { describe, expect, it } from "vitest"
import {
  cross,
  dot,
  normalize,
  pointAdd,
  pointDistance,
  pointDistanceSq,
  pointScale,
  pointSubtract,
  vectorLength,
  vectorLengthSq,
} from "../src"
import type { Point, Vector } from "../src"

const ZERO: Point = { x: 0, y: 0 }

describe("pointAdd", () => {
  it.each<[Point, Vector, Point]>([
    [ZERO, ZERO, ZERO],
    [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 4, y: 6 },
    ],
    [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ],
    [
      { x: 5, y: -3 },
      { x: -2, y: 7 },
      { x: 3, y: 4 },
    ],
  ])("pointAdd(%j, %j) === %j", (a, b, expected) => {
    expect(pointAdd(a, b)).toEqual(expected)
  })
})

describe("pointSubtract", () => {
  it.each<[Point, Point, Vector]>([
    [ZERO, ZERO, ZERO],
    [
      { x: 5, y: 7 },
      { x: 2, y: 3 },
      { x: 3, y: 4 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: -1, y: -1 },
    ],
  ])("pointSubtract(%j, %j) === %j", (a, b, expected) => {
    expect(pointSubtract(a, b)).toEqual(expected)
  })
})

describe("pointScale", () => {
  it.each<[Point, number, Point]>([
    [{ x: 2, y: 3 }, 0, ZERO],
    [{ x: 2, y: 3 }, 1, { x: 2, y: 3 }],
    [{ x: 2, y: 3 }, 2, { x: 4, y: 6 }],
    [{ x: 2, y: 3 }, -1, { x: -2, y: -3 }],
    [{ x: 4, y: 8 }, 0.5, { x: 2, y: 4 }],
  ])("pointScale(%j, %d) === %j", (p, s, expected) => {
    expect(pointScale(p, s)).toEqual(expected)
  })
})

describe("dot product", () => {
  it.each<[Vector, Vector, number]>([
    [ZERO, ZERO, 0],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, 0],
    [{ x: 1, y: 2 }, { x: 3, y: 4 }, 11],
    [{ x: 1, y: 1 }, { x: 1, y: 1 }, 2],
    [{ x: 1, y: 0 }, { x: -1, y: 0 }, -1],
  ])("dot(%j, %j) === %d", (a, b, expected) => {
    expect(dot(a, b)).toBe(expected)
  })
})

describe("cross product", () => {
  it.each<[Vector, Vector, number]>([
    [ZERO, ZERO, 0],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, 1],
    [{ x: 0, y: 1 }, { x: 1, y: 0 }, -1],
    [{ x: 2, y: 3 }, { x: 4, y: 5 }, -2],
  ])("cross(%j, %j) === %d", (a, b, expected) => {
    expect(cross(a, b)).toBe(expected)
  })
})

describe("vectorLength / vectorLengthSq", () => {
  it.each<[Vector, number, number]>([
    [ZERO, 0, 0],
    [{ x: 3, y: 4 }, 5, 25],
    [{ x: -3, y: -4 }, 5, 25],
    [{ x: 1, y: 0 }, 1, 1],
    [{ x: 0, y: 1 }, 1, 1],
  ])("vector %j has length %d (sq %d)", (v, len, lenSq) => {
    expect(vectorLength(v)).toBeCloseTo(len)
    expect(vectorLengthSq(v)).toBe(lenSq)
  })
})

describe("pointDistance / pointDistanceSq", () => {
  it.each<[Point, Point, number, number]>([
    [ZERO, ZERO, 0, 0],
    [ZERO, { x: 3, y: 4 }, 5, 25],
    [{ x: 1, y: 1 }, { x: 4, y: 5 }, 5, 25],
    [{ x: -1, y: -1 }, { x: 2, y: 3 }, 5, 25],
  ])("distance(%j, %j) === %d (sq %d)", (a, b, d, dSq) => {
    expect(pointDistance(a, b)).toBeCloseTo(d)
    expect(pointDistanceSq(a, b)).toBe(dSq)
  })
})

describe("normalize", () => {
  it("returns zero vector when input is zero (no NaN)", () => {
    expect(normalize(ZERO)).toEqual(ZERO)
  })

  it.each<[Vector, Vector]>([
    [
      { x: 5, y: 0 },
      { x: 1, y: 0 },
    ],
    [
      { x: 0, y: 5 },
      { x: 0, y: 1 },
    ],
    [
      { x: -3, y: 0 },
      { x: -1, y: 0 },
    ],
  ])("normalize(%j) === %j", (v, expected) => {
    const result = normalize(v)
    expect(result.x).toBeCloseTo(expected.x)
    expect(result.y).toBeCloseTo(expected.y)
  })

  it("normalized vector has length 1", () => {
    const v: Vector = { x: 3, y: 4 }
    expect(vectorLength(normalize(v))).toBeCloseTo(1)
  })
})
