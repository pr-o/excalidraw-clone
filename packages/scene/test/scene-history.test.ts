import { describe, expect, it } from "vitest"
import { Scene, newRectangle } from "../src"

describe("Scene history — initial state", () => {
  it("fresh scene cannot undo or redo", () => {
    const s = new Scene()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
  })
})

describe("Scene history — undo / redo flow", () => {
  it("after one mutate: canUndo true, canRedo false", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(false)
  })

  it("undo restores prior state, redo re-applies", () => {
    const s = new Scene()
    const r = newRectangle({ x: 0, y: 0 })
    s.mutate((d) => {
      d.push(r)
    })
    expect(s.getElements().length).toBe(1)
    s.undo()
    expect(s.getElements().length).toBe(0)
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(true)
    s.redo()
    expect(s.getElements().length).toBe(1)
    expect(s.canRedo()).toBe(false)
  })

  it("new mutate after undo drops the redo branch", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.mutate((d) => {
      d.push(newRectangle({ x: 1, y: 1 }))
    })
    expect(s.getElements().length).toBe(2)
    s.undo()
    expect(s.getElements().length).toBe(1)
    s.mutate((d) => {
      d.push(newRectangle({ x: 2, y: 2 }))
    })
    expect(s.canRedo()).toBe(false)
  })

  it("undo at the start is a no-op", () => {
    const s = new Scene()
    s.undo()
    expect(s.getElements()).toEqual([])
  })

  it("redo at the end is a no-op", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.redo()
    expect(s.getElements().length).toBe(1)
  })
})

describe("Scene history — skipHistory", () => {
  it("mutations with skipHistory don't push", () => {
    const s = new Scene()
    s.mutate(
      (d) => {
        d.push(newRectangle({ x: 0, y: 0 }))
      },
      { skipHistory: true },
    )
    expect(s.canUndo()).toBe(false)
    expect(s.getElements().length).toBe(1)
  })
})

describe("Scene history — cap", () => {
  it("caps at MAX_HISTORY (100); 110 mutations leave only the last 100 reachable", () => {
    const s = new Scene()
    for (let i = 0; i < 110; i += 1) {
      s.mutate((d) => {
        d.push(newRectangle({ x: i, y: 0 }))
      })
    }
    expect(s.getElements().length).toBe(110)
    let undos = 0
    while (s.canUndo()) {
      s.undo()
      undos += 1
    }
    expect(undos).toBe(99)
    expect(s.getElements().length).toBe(11)
  })
})
