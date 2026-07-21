import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { bringForward, bringToFront, sendBackward, sendToBack } from "../src/z-order"

const rect = (x: number) => newRectangle({ x, y: 0, width: 10, height: 10 })

describe("sendToBack", () => {
  it("moves a single selected element to the front of the array (visual back)", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendToBack([a, b, c, d], [c.id])
    expect(result.map((e) => e.id)).toEqual([c.id, a.id, b.id, d.id])
  })

  it("moves multiple selected elements together, preserving their relative order", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendToBack([a, b, c, d], [b.id, c.id])
    expect(result.map((e) => e.id)).toEqual([b.id, c.id, a.id, d.id])
  })

  it("no-ops on an empty selection", () => {
    const a = rect(0)
    const b = rect(20)
    expect(sendToBack([a, b], []).map((e) => e.id)).toEqual([a.id, b.id])
  })
})

describe("bringToFront", () => {
  it("moves a single selected element to the end of the array (visual front)", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringToFront([a, b, c, d], [a.id])
    expect(result.map((e) => e.id)).toEqual([b.id, c.id, d.id, a.id])
  })

  it("moves multiple selected elements together, preserving their relative order", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringToFront([a, b, c, d], [a.id, b.id])
    expect(result.map((e) => e.id)).toEqual([c.id, d.id, a.id, b.id])
  })
})

describe("sendBackward", () => {
  it("swaps a selected element with its unselected left neighbor", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendBackward([a, b, c, d], [c.id])
    expect(result.map((e) => e.id)).toEqual([a.id, c.id, b.id, d.id])
  })

  it("moves an adjacent selected pair back together without swapping past each other", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = sendBackward([a, b, c, d], [b.id, c.id])
    expect(result.map((e) => e.id)).toEqual([b.id, c.id, a.id, d.id])
  })

  it("no-ops when the selected element is already at the back", () => {
    const a = rect(0)
    const b = rect(20)
    expect(sendBackward([a, b], [a.id]).map((e) => e.id)).toEqual([a.id, b.id])
  })
})

describe("bringForward", () => {
  it("swaps a selected element with its unselected right neighbor", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringForward([a, b, c, d], [a.id])
    expect(result.map((e) => e.id)).toEqual([b.id, a.id, c.id, d.id])
  })

  it("moves an adjacent selected pair forward together without swapping past each other", () => {
    const a = rect(0)
    const b = rect(20)
    const c = rect(40)
    const d = rect(60)
    const result = bringForward([a, b, c, d], [a.id, b.id])
    expect(result.map((e) => e.id)).toEqual([c.id, a.id, b.id, d.id])
  })

  it("no-ops when the selected element is already at the front", () => {
    const a = rect(0)
    const b = rect(20)
    expect(bringForward([a, b], [b.id]).map((e) => e.id)).toEqual([a.id, b.id])
  })
})
