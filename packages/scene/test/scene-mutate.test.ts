import { describe, expect, it, vi } from "vitest"
import { Scene, newArrow, newRectangle } from "../src"
import { BINDING_GAP } from "../src/bindings"

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

describe("Scene.mutate — binding reconciliation", () => {
  it("moving a bound target updates the arrow endpoint through mutate()", () => {
    const scene = new Scene()
    const target = { ...newRectangle({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
    const arrow = {
      ...newArrow({ x: 0, y: 50 }),
      id: "ar",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      width: 100,
      height: 0,
      endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP },
    }
    scene.mutate((draft) => {
      draft.push(target, arrow)
    })
    const before = scene.getElements().find((e) => e.id === "ar")!
    const beforeEndX = before.x + (before as typeof arrow).points[1]!.x

    scene.mutate((draft) => {
      const i = draft.findIndex((e) => e.id === "t")
      draft[i] = { ...draft[i]!, x: 500 }
    })
    const after = scene.getElements().find((e) => e.id === "ar")!
    const afterEndX = after.x + (after as typeof arrow).points[1]!.x
    expect(afterEndX).toBeGreaterThan(beforeEndX)
  })
})

describe("Scene.mutate — no-op dedup", () => {
  it("does not push history for a value-identical element replacement", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const s = new Scene([r])
    const historyBefore = s.getHistory().length
    const indexBefore = s.getHistoryIndex()

    // A plain click-to-select commits a value-identical clone of the element.
    s.mutate((d) => {
      d[0] = { ...d[0]! }
    })

    expect(s.getHistory().length).toBe(historyBefore)
    expect(s.getHistoryIndex()).toBe(indexBefore)
    expect(s.canRedo()).toBe(false)
  })

  it("does not push history when the draft is untouched", () => {
    const r = newRectangle({ x: 0, y: 0 })
    const s = new Scene([r])
    const before = s.getHistory().length
    s.mutate(() => {})
    expect(s.getHistory().length).toBe(before)
  })

  it("repeated no-op mutations never evict real history entries", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    const after = s.getHistory().length
    for (let i = 0; i < 150; i += 1) {
      s.mutate((d) => {
        d[0] = { ...d[0]! }
      })
    }
    expect(s.getHistory().length).toBe(after)
    expect(s.canUndo()).toBe(true)
    s.undo()
    expect(s.getElements().length).toBe(0)
  })

  it("still pushes history when a value actually changes", () => {
    const r = newRectangle({ x: 0, y: 0 })
    const s = new Scene([r])
    const before = s.getHistory().length
    s.mutate((d) => {
      d[0] = { ...d[0]!, x: 5 }
    })
    expect(s.getHistory().length).toBe(before + 1)
    expect(s.canUndo()).toBe(true)
  })

  it("pushes history for a draw gesture whose final commit matches its last draft frame", () => {
    const s = new Scene()
    // Drawing a rectangle: every pointer-move frame commits with skipHistory,
    // so `this.elements` runs ahead of the undo stack while the gesture is live.
    s.mutate(
      (d) => {
        d.push(newRectangle({ x: 0, y: 0, width: 1, height: 1 }))
      },
      { skipHistory: true },
    )
    s.mutate(
      (d) => {
        d[0] = { ...d[0]!, width: 50, height: 50 }
      },
      { skipHistory: true },
    )
    expect(s.getHistory().length).toBe(1) // nothing recorded yet

    // pointerUp finalizes with the exact geometry of the last draft frame: a
    // no-op against live state, but the first real change against the undo
    // stack, so it must be recorded.
    s.mutate((d) => {
      d[0] = { ...d[0]! }
    })

    expect(s.getHistory().length).toBe(2)
    expect(s.canUndo()).toBe(true)
    s.undo()
    expect(s.getElements().length).toBe(0)
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
