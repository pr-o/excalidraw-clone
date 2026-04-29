import { describe, expect, it, vi } from "vitest"
import { Scene, newRectangle } from "../src"

describe("Scene.mutate — basic add/replace", () => {
  it("adds an element via push", () => {
    const s = new Scene()
    const r = newRectangle({ x: 0, y: 0 })
    s.mutate((d) => {
      d.push(r)
    })
    expect(s.getElements()).toEqual([r])
  })

  it("replaces an element by index", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const s = new Scene([r])
    s.mutate((d) => {
      d[0] = { ...d[0]!, x: 99 }
    })
    expect(s.getElements()[0]?.x).toBe(99)
  })

  it("removes an element via splice", () => {
    const r = newRectangle({ x: 0, y: 0 })
    const s = new Scene([r])
    s.mutate((d) => {
      d.splice(0, 1)
    })
    expect(s.getElements()).toEqual([])
  })
})

describe("Scene.mutate — structural sharing", () => {
  it("mutate produces a new elements array reference", () => {
    const r = newRectangle({ x: 0, y: 0 })
    const s = new Scene([r])
    const before = s.getElementsIncludingDeleted()
    s.mutate((d) => {
      d.push(newRectangle({ x: 1, y: 1 }))
    })
    const after = s.getElementsIncludingDeleted()
    expect(after).not.toBe(before)
  })

  it("unchanged elements retain their reference (structural sharing)", () => {
    const r1 = newRectangle({ x: 0, y: 0 })
    const r2 = newRectangle({ x: 1, y: 1 })
    const s = new Scene([r1, r2])
    s.mutate((d) => {
      d[0] = { ...d[0]!, x: 99 }
    })
    const next = s.getElements()
    expect(next[0]).not.toBe(r1)
    expect(next[1]).toBe(r2)
  })
})

describe("Scene.mutate — listeners", () => {
  it("subscribers fire exactly once per mutate", () => {
    const s = new Scene()
    const fn = vi.fn()
    s.subscribe(fn)
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    expect(fn).toHaveBeenCalledTimes(1)
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe("Scene.mutate — skipHistory option", () => {
  it("accepts opts without throwing", () => {
    const s = new Scene()
    expect(() =>
      s.mutate(
        (d) => {
          d.push(newRectangle({ x: 0, y: 0 }))
        },
        { skipHistory: true },
      ),
    ).not.toThrow()
    expect(s.getElements().length).toBe(1)
  })
})
