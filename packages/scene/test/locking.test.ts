import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { lockElements, unlockAll } from "../src/locking"
import type { ExcalidrawElement } from "../src/types"

const rect = (x: number): ExcalidrawElement => newRectangle({ x, y: 0, width: 10, height: 10 })
const asLocked = (el: ExcalidrawElement): ExcalidrawElement => ({ ...el, locked: true })

describe("lockElements", () => {
  it("returns locked patches for the requested ids only", () => {
    const a = rect(0)
    const b = rect(20)
    const patches = lockElements([a, b], [a.id])
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe(a.id)
    expect(patches[0]!.locked).toBe(true)
  })

  it("bumps versionNonce and updated on each patch", () => {
    const a = rect(0)
    const before = a.updated
    const patches = lockElements([a], [a.id])
    expect(patches[0]!.versionNonce).not.toBe(a.versionNonce)
    expect(patches[0]!.updated).toBeGreaterThanOrEqual(before)
  })

  it("skips ids that are already locked or deleted", () => {
    const a = asLocked(rect(0))
    const dead = { ...rect(20), isDeleted: true }
    expect(lockElements([a, dead], [a.id, dead.id])).toEqual([])
  })

  it("ignores unknown ids and does not mutate inputs", () => {
    const a = rect(0)
    expect(lockElements([a], ["ghost"])).toEqual([])
    lockElements([a], [a.id])
    expect(a.locked).toBe(false)
  })
})

describe("unlockAll", () => {
  it("returns unlocked patches for every non-deleted locked element", () => {
    const a = asLocked(rect(0))
    const b = rect(20)
    const c = asLocked(rect(40))
    const patches = unlockAll([a, b, c])
    expect(patches.map((p) => p.id).sort()).toEqual([a.id, c.id].sort())
    for (const p of patches) expect(p.locked).toBe(false)
  })

  it("skips deleted locked elements", () => {
    const dead = { ...asLocked(rect(0)), isDeleted: true }
    expect(unlockAll([dead])).toEqual([])
  })

  it("returns an empty array when nothing is locked and does not mutate inputs", () => {
    const a = rect(0)
    expect(unlockAll([a])).toEqual([])
    const b = asLocked(rect(20))
    unlockAll([b])
    expect(b.locked).toBe(true)
  })
})
