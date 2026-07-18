import { describe, expect, it } from "vitest"
import {
  Scene,
  expandIdsToFrameMembers,
  newFrame,
  newRectangle,
  newText,
  reconcileFrameMembership,
} from "../src"
import type { ExcalidrawElement } from "../src"

describe("reconcileFrameMembership", () => {
  it("assigns frameId to fully contained elements on mutate", () => {
    const rect = newRectangle({ x: 10, y: 10, width: 20, height: 20 })
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const scene = new Scene([rect])
    scene.mutate((d) => {
      d.push(frame)
    })
    expect(scene.getElements().find((e) => e.id === rect.id)!.frameId).toBe(frame.id)
  })

  it("clears frameId when the element moves out of its frame", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const rect = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const scene = new Scene([frame, rect])
    scene.mutate((d) => {
      const i = d.findIndex((e) => e.id === rect.id)
      d[i] = { ...d[i]!, x: 200, y: 200 }
    })
    expect(scene.getElements().find((e) => e.id === rect.id)!.frameId).toBeNull()
  })

  it("topmost (later in scene order) containing frame wins", () => {
    const below = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const above = newFrame({ x: 0, y: 0, width: 80, height: 80 })
    const rect = newRectangle({ x: 10, y: 10, width: 20, height: 20 })
    const draft: ExcalidrawElement[] = [below, above, rect]
    reconcileFrameMembership(draft)
    expect(draft[2]!.frameId).toBe(above.id)
  })

  it("releases members when their frame is deleted", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const rect = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const scene = new Scene([frame, rect])
    scene.mutate((d) => {
      const i = d.findIndex((e) => e.id === frame.id)
      d[i] = { ...d[i]!, isDeleted: true }
    })
    const r = scene.getElements().find((e) => e.id === rect.id)!
    expect(r.frameId).toBeNull()
    expect(r.isDeleted).toBe(false)
  })

  it("skips bound labels — they follow their container", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const label = newText({ x: 10, y: 10, width: 20, height: 20, text: "hi", containerId: "C" })
    const draft: ExcalidrawElement[] = [frame, label]
    reconcileFrameMembership(draft)
    expect(draft[1]!.frameId).toBeNull()
  })

  it("never assigns frames to frames", () => {
    const outer = newFrame({ x: 0, y: 0, width: 200, height: 200 })
    const inner = newFrame({ x: 10, y: 10, width: 50, height: 50 })
    const draft: ExcalidrawElement[] = [outer, inner]
    reconcileFrameMembership(draft)
    expect(draft[1]!.frameId).toBeNull()
  })

  it("is reference-stable when nothing changes", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const rect = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const draft: ExcalidrawElement[] = [frame, rect]
    reconcileFrameMembership(draft)
    const after = draft[1]!
    reconcileFrameMembership(draft)
    expect(draft[1]).toBe(after)
  })
})

describe("expandIdsToFrameMembers", () => {
  it("appends member ids for a frame id and passes others through", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const outside = newRectangle({ x: 300, y: 300, width: 20, height: 20 })
    const elements: ExcalidrawElement[] = [frame, member, outside]
    expect(expandIdsToFrameMembers([frame.id], elements).sort()).toEqual(
      [frame.id, member.id].sort(),
    )
    expect(expandIdsToFrameMembers([outside.id], elements)).toEqual([outside.id])
  })

  it("skips deleted members and does not duplicate ids", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const dead = {
      ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }),
      frameId: frame.id,
      isDeleted: true,
    }
    const member = { ...newRectangle({ x: 40, y: 40, width: 20, height: 20 }), frameId: frame.id }
    const elements: ExcalidrawElement[] = [frame, dead, member]
    expect(expandIdsToFrameMembers([frame.id, member.id], elements).sort()).toEqual(
      [frame.id, member.id].sort(),
    )
  })
})
