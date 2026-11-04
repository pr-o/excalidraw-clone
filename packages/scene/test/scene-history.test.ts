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

describe("Scene history — getHistory / getHistoryIndex / jumpToHistory", () => {
  it("getHistory returns every snapshot; getHistoryIndex tracks the current position", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.mutate((d) => {
      d.push(newRectangle({ x: 1, y: 1 }))
    })
    expect(s.getHistory().length).toBe(3) // initial (empty) + 2 mutations
    expect(s.getHistoryIndex()).toBe(2)
  })

  it("jumpToHistory jumps directly to an arbitrary earlier index", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.mutate((d) => {
      d.push(newRectangle({ x: 1, y: 1 }))
    })
    s.mutate((d) => {
      d.push(newRectangle({ x: 2, y: 2 }))
    })
    s.jumpToHistory(0)
    expect(s.getElements().length).toBe(0)
    expect(s.getHistoryIndex()).toBe(0)
  })

  it("jumpToHistory forward re-applies a later state", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.mutate((d) => {
      d.push(newRectangle({ x: 1, y: 1 }))
    })
    s.jumpToHistory(0)
    s.jumpToHistory(2)
    expect(s.getElements().length).toBe(2)
    expect(s.getHistoryIndex()).toBe(2)
  })

  it("jumpToHistory is a no-op for a negative index", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.jumpToHistory(-1)
    expect(s.getHistoryIndex()).toBe(1)
    expect(s.getElements().length).toBe(1)
  })

  it("jumpToHistory is a no-op for an index at or beyond history.length", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.jumpToHistory(5)
    expect(s.getHistoryIndex()).toBe(1)
    expect(s.getElements().length).toBe(1)
  })

  it("a mutate() after jumping back truncates the future, same as after undo()", () => {
    const s = new Scene()
    s.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0 }))
    })
    s.mutate((d) => {
      d.push(newRectangle({ x: 1, y: 1 }))
    })
    s.jumpToHistory(0)
    s.mutate((d) => {
      d.push(newRectangle({ x: 2, y: 2 }))
    })
    expect(s.canRedo()).toBe(false)
    expect(s.getHistory().length).toBe(2) // initial + the new branch's one mutation
  })
})

describe("Scene.normalize — history-silent fixes", () => {
  const widen = (e: ReturnType<typeof newRectangle>) => (e.width === 10 ? { ...e, width: 20 } : e)

  it("rewrites live elements and every undo snapshot without a new entry", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const s = new Scene([r])
    s.mutate((d) => {
      d[0] = { ...d[0]!, x: 5 }
    })
    s.normalize((e) => (e.type === "rectangle" ? widen(e) : e))
    expect(s.getHistory().length).toBe(2)
    expect(s.getElements()[0]!.width).toBe(20)
    s.undo()
    // The first state is normalised too: no stale value comes back on undo.
    expect(s.getElements()[0]).toMatchObject({ x: 0, width: 20 })
  })

  it("a no-op commit after normalising does not add an entry", () => {
    const s = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    s.normalize((e) => (e.type === "rectangle" ? widen(e) : e))
    s.mutate((d) => {
      d[0] = { ...d[0]! }
    })
    expect(s.getHistory().length).toBe(1)
    expect(s.canUndo()).toBe(false)
  })

  it("does not notify when nothing changes", () => {
    const s = new Scene([newRectangle({ x: 0, y: 0 })])
    let calls = 0
    s.subscribe(() => (calls += 1))
    s.normalize((e) => e)
    expect(calls).toBe(0)
  })
})

describe("Scene notification order", () => {
  it("listeners already see the history entry of the mutation that notified them", () => {
    const scene = new Scene()
    const seen: number[] = []
    scene.subscribe(() => seen.push(scene.getHistory().length))
    scene.mutate((d) => {
      d.push(newRectangle({ x: 0, y: 0, width: 10, height: 10 }))
    })
    expect(seen).toEqual([2])
  })
})
