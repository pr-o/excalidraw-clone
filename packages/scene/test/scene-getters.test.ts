import { describe, expect, it, vi } from "vitest"
import { Scene, newRectangle } from "../src"

const addRectangle = (s: Scene): void =>
  s.mutate((d) => {
    d.push(newRectangle({ x: 0, y: 0 }))
  })

describe("Scene — empty state", () => {
  it("constructs with no elements", () => {
    const s = new Scene()
    expect(s.getElements()).toEqual([])
    expect(s.getElementsIncludingDeleted()).toEqual([])
  })
})

describe("Scene — getters filter deleted", () => {
  it("getElements omits isDeleted=true elements", () => {
    const live = newRectangle({ x: 0, y: 0 })
    const dead = { ...newRectangle({ x: 1, y: 1 }), isDeleted: true }
    const s = new Scene([live, dead])
    expect(s.getElements()).toEqual([live])
    expect(s.getElementsIncludingDeleted()).toEqual([live, dead])
  })
})

describe("Scene — subscribe", () => {
  it("returns an unsubscribe function", () => {
    const s = new Scene()
    const fn = vi.fn()
    const unsubscribe = s.subscribe(fn)
    addRectangle(s)
    expect(fn).toHaveBeenCalledTimes(1)
    unsubscribe()
    addRectangle(s)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("multiple listeners all fire", () => {
    const s = new Scene()
    const a = vi.fn()
    const b = vi.fn()
    s.subscribe(a)
    s.subscribe(b)
    addRectangle(s)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
