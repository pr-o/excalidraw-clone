import { describe, expect, it } from "vitest"
import { newRectangle } from "../src/factories"
import { expandIdsToGroups, groupElements, ungroupElements } from "../src/groups"
import type { ExcalidrawElement } from "../src/types"

const rect = (x: number): ExcalidrawElement => newRectangle({ x, y: 0, width: 10, height: 10 })
const inGroup = (el: ExcalidrawElement, gid: string): ExcalidrawElement => ({
  ...el,
  groupIds: [gid],
})

describe("groupElements", () => {
  it("assigns the given groupId to every matched element", () => {
    const a = rect(0)
    const b = rect(20)
    const patches = groupElements([a, b], [a.id, b.id], "g1")
    expect(patches).toHaveLength(2)
    for (const p of patches) expect(p.groupIds).toEqual(["g1"])
  })

  it("returns an empty array (no-op) for fewer than 2 matched elements", () => {
    const a = rect(0)
    expect(groupElements([a], [a.id], "g1")).toEqual([])
    expect(groupElements([a], ["missing"], "g1")).toEqual([])
  })

  it("overwrites prior membership (regroup absorbs)", () => {
    const a = inGroup(rect(0), "old")
    const b = rect(20)
    const patches = groupElements([a, b], [a.id, b.id], "new")
    expect(patches.find((p) => p.id === a.id)?.groupIds).toEqual(["new"])
  })
})

describe("ungroupElements", () => {
  it("clears groupIds on matched grouped elements only", () => {
    const a = inGroup(rect(0), "g1")
    const b = rect(20) // already ungrouped — not patched
    const patches = ungroupElements([a, b], [a.id, b.id])
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe(a.id)
    expect(patches[0]!.groupIds).toEqual([])
  })

  it("returns an empty array when nothing is grouped", () => {
    const a = rect(0)
    expect(ungroupElements([a], [a.id])).toEqual([])
  })
})

describe("expandIdsToGroups", () => {
  it("expands a member id to the whole group, preserving scene order", () => {
    const a = inGroup(rect(0), "g1")
    const b = rect(20)
    const c = inGroup(rect(40), "g1")
    expect(expandIdsToGroups([c.id], [a, b, c])).toEqual([a.id, c.id])
  })

  it("returns ids unchanged when none are grouped", () => {
    const a = rect(0)
    const b = rect(20)
    expect(expandIdsToGroups([a.id], [a, b])).toEqual([a.id])
  })

  it("excludes deleted elements from expansion", () => {
    const a = inGroup(rect(0), "g1")
    const dead = { ...inGroup(rect(20), "g1"), isDeleted: true }
    expect(expandIdsToGroups([a.id], [a, dead])).toEqual([a.id])
  })

  it("passes through ids not present in elements", () => {
    const a = rect(0)
    expect(expandIdsToGroups(["ghost"], [a])).toEqual(["ghost"])
  })
})
