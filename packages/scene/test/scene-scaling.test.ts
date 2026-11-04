import { describe, expect, it } from "vitest"
import { Scene, newArrow, newFrame, newRectangle, newText } from "../src"
import type { ExcalidrawElement } from "../src"

/** n mixed elements: labelled rects, bound arrows, and a frame per 50 elements. */
function bigScene(n: number): ExcalidrawElement[] {
  const out: ExcalidrawElement[] = []
  for (let i = 0; out.length < n; i += 1) {
    const x = (i % 40) * 200
    const y = Math.floor(i / 40) * 200
    if (i % 10 === 0) out.push(newFrame({ x: x - 5, y: y - 5, width: 190, height: 190 }))
    const a = newRectangle({ x, y, width: 60, height: 40 })
    const b = newRectangle({ x: x + 100, y, width: 60, height: 40 })
    const label = { ...newText({ x, y, text: "L" }), containerId: a.id }
    const arrow = {
      ...newArrow({ x: x + 64, y: y + 20 }),
      points: [
        { x: 0, y: 0 },
        { x: 32, y: 0 },
      ],
      startBinding: { elementId: a.id, focus: 0, gap: 4 },
      endBinding: { elementId: b.id, focus: 0, gap: 4 },
    }
    out.push(
      {
        ...a,
        boundElements: [
          { id: label.id, type: "text" },
          { id: arrow.id, type: "arrow" },
        ],
      },
      { ...b, boundElements: [{ id: arrow.id, type: "arrow" }] },
      label,
      arrow,
    )
  }
  return out
}

/** Fastest of several batches: CPU ms per drag-frame style mutate (skipHistory, one
 *  element moved) on a single n-element scene. CPU time, not wall-clock, so being
 *  descheduled while other test files run in parallel does not count; the minimum
 *  over batches discards the remaining noise (GC, cache). The scene is built once
 *  because building it dominates the cost. */
function cpuMsPerMutate(n: number, batches = 1): number {
  const scene = new Scene(bigScene(n))
  scene.mutate(() => {}) // reconcile once, like any edited scene
  const id = scene.getElements()[Math.floor(n / 2)]!.id
  const perBatch = 15
  let best = Infinity
  for (let b = 0; b < batches; b += 1) {
    const t0 = process.cpuUsage()
    for (let r = 0; r < perBatch; r += 1) {
      scene.mutate(
        (d) => {
          const i = d.findIndex((e) => e.id === id)
          d[i] = { ...d[i]!, x: d[i]!.x + 1 }
        },
        { skipHistory: true },
      )
    }
    const used = process.cpuUsage(t0)
    best = Math.min(best, (used.user + used.system) / 1000 / perBatch)
  }
  return best
}

describe("Scene scaling (regression guard against quadratic per-mutate work)", () => {
  it("one-element mutate grows ~linearly with scene size", () => {
    cpuMsPerMutate(500) // warm up the JIT
    const small = cpuMsPerMutate(1000, 5)
    const large = cpuMsPerMutate(8000, 5)
    // 8x the elements: linear ≈ 8x, quadratic ≈ 64x. The bound sits halfway (on a log
    // scale) so cache and GC noise on a busy machine cannot trip it.
    expect(large / Math.max(small, 0.05)).toBeLessThan(32)
  })

  it("getElements returns one cached array until the elements change", () => {
    const scene = new Scene(bigScene(100))
    const a = scene.getElements()
    expect(scene.getElements()).toBe(a)
    scene.mutate((d) => {
      d[0] = { ...d[0]!, isDeleted: true }
    })
    const b = scene.getElements()
    expect(b).not.toBe(a)
    expect(b.length).toBe(a.length - 1)
  })
})

describe("incremental frame membership stays exact", () => {
  it("still fixes stale frameIds of untouched elements in an unreconciled (loaded) scene", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const inside = newRectangle({ x: 10, y: 10, width: 20, height: 20 }) // frameId null: stale
    const other = newRectangle({ x: 500, y: 500, width: 20, height: 20 })
    const scene = new Scene([frame, inside, other])
    scene.mutate((d) => {
      d[2] = { ...d[2]!, x: 510 }
    })
    expect(scene.getElements()[1]!.frameId).toBe(frame.id)
  })

  it("re-checks every element when a frame moves, and after undo", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const rect = newRectangle({ x: 10, y: 10, width: 20, height: 20 })
    const scene = new Scene([frame, rect])
    scene.mutate(() => {})
    expect(scene.getElements()[1]!.frameId).toBe(frame.id)
    scene.mutate((d) => {
      d[0] = { ...d[0]!, x: 300 }
    })
    expect(scene.getElements()[1]!.frameId).toBeNull()
    scene.undo()
    scene.mutate((d) => {
      d.push(newRectangle({ x: 900, y: 900, width: 5, height: 5 }))
    })
    expect(scene.getElements()[1]!.frameId).toBe(frame.id)
  })
})
