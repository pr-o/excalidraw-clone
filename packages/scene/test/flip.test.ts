import { describe, expect, it } from "vitest"
import {
  newArrow,
  newFrame,
  newFreedraw,
  newLabelFor,
  newParallelogram,
  newRectangle,
  newTriangle,
} from "../src/factories"
import { flipElements } from "../src/flip"
import type { ExcalidrawElement } from "../src/types"

/** A labelled triangle: container carrying a bound text child. */
const labelledTriangle = (box: {
  x: number
  y: number
  width: number
  height: number
}): { container: ExcalidrawElement; label: ExcalidrawElement } => {
  const base = newTriangle(box)
  const label = { ...newLabelFor(base), text: "hi" }
  return {
    container: { ...base, boundElements: [{ id: label.id, type: "text" as const }] },
    label,
  }
}

describe("flipElements — single element", () => {
  it("triangle, x-axis: mirror becomes [-1,1], angle negated, box unchanged", () => {
    const t = { ...newTriangle({ x: 10, y: 20, width: 40, height: 30, angle: 0.5 }) }
    const [out] = flipElements([t], [t.id], "x")
    expect(out!.mirror).toEqual([-1, 1])
    expect(out!.angle).toBe(-0.5)
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([10, 20, 40, 30])
  })

  it("triangle, y-axis: mirror becomes [1,-1]", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 40, height: 30 }) }
    const [out] = flipElements([t], [t.id], "y")
    expect(out!.mirror).toEqual([1, -1])
    expect(out!.angle).toBe(0) // -0 normalized
  })

  it("flip∘flip on the same axis restores the original element exactly", () => {
    const t = { ...newTriangle({ x: 5, y: 6, width: 40, height: 30, angle: 0.25 }) }
    const [once] = flipElements([t], [t.id], "x")
    const [twice] = flipElements([once!], [once!.id], "x")
    expect(twice).toEqual(t) // mirror key omitted again
  })

  it("parallelogram x-flip toggles the sign", () => {
    const p = {
      ...newParallelogram({ x: 0, y: 0, width: 40, height: 30 }),
      mirror: [-1, 1] as const,
    }
    const [out] = flipElements([p], [p.id], "x")
    expect(out!.mirror).toBeUndefined()
  })

  it("freedraw: points mirrored across the local centre, bbox unchanged", () => {
    const f = {
      ...newFreedraw({ x: 0, y: 0, width: 100, height: 40 }),
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 10 },
        { x: 100, y: 40 },
      ],
    }
    const [out] = flipElements([f], [f.id], "x")
    expect((out as typeof f).points).toEqual([
      { x: 100, y: 0 },
      { x: 70, y: 10 },
      { x: 0, y: 40 },
    ])
    expect((out as typeof f).mirror).toBeUndefined()
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([0, 0, 100, 40])
  })

  it("arrow with startBinding.focus 0.3 becomes -0.3", () => {
    const a = {
      ...newArrow({ x: 0, y: 0, width: 50, height: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      startBinding: { elementId: "s", focus: 0.3, gap: 4 },
      endBinding: { elementId: "e", focus: -0.1, gap: 4 },
    }
    const [out] = flipElements([a], [a.id], "x") as [typeof a]
    expect(out.startBinding.focus).toBe(-0.3)
    expect(out.endBinding.focus).toBe(0.1)
  })

  it("returns [] when the only selected id is missing or deleted", () => {
    const t = { ...newTriangle({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true }
    expect(flipElements([t], [t.id], "x")).toEqual([])
    expect(flipElements([t], ["ghost"], "x")).toEqual([])
  })

  it("freedraw, y-axis: point y's mirrored across the local centre, x's untouched", () => {
    const f = {
      ...newFreedraw({ x: 0, y: 0, width: 100, height: 40 }),
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 10 },
        { x: 70, y: 25 },
        { x: 100, y: 40 },
      ],
    }
    const [out] = flipElements([f], [f.id], "y")
    expect((out as typeof f).points).toEqual(f.points.map((p) => ({ x: p.x, y: f.height - p.y })))
    expect([out!.x, out!.y, out!.width, out!.height]).toEqual([0, 0, 100, 40])
  })

  it("flip∘flip on an arrow restores points, angle and binding focus exactly", () => {
    const a = {
      ...newArrow({ x: 3, y: 4, width: 50, height: 20, angle: 0.4 }),
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
        { x: 50, y: 5 },
      ],
      startBinding: { elementId: "s", focus: 0.3, gap: 4 },
      endBinding: { elementId: "e", focus: -0.1, gap: 4 },
    }
    const [once] = flipElements([a], [a.id], "x") as [typeof a]
    const [twice] = flipElements([once], [once.id], "x") as [typeof a]
    expect(twice.points).toEqual(a.points)
    expect(twice.angle).toBe(a.angle)
    expect(twice.startBinding.focus).toBe(a.startBinding.focus)
    expect(twice.endBinding.focus).toBe(a.endBinding.focus)
  })

  it("returns [] for an empty id list", () => {
    const t = newTriangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(flipElements([t], [], "x")).toEqual([])
  })
})

describe("flipElements — multi-selection", () => {
  it("two rects: centres reflected across the combined-bounds mid-axis, x-axis", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 }) // centre x 10
    const b = newRectangle({ x: 100, y: 0, width: 40, height: 20 }) // centre x 120
    // combined bounds x 0..140 -> centre 70
    const out = flipElements([a, b], [a.id, b.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.get(a.id)!.x).toBe(2 * 70 - 10 - 10) // 120
    expect(byId.get(b.id)!.x).toBe(2 * 70 - 120 - 20) // 0
    expect(byId.get(a.id)!.y).toBe(0)
  })

  it("mixed shapes: each is repositioned AND individually flipped", () => {
    const tri = newTriangle({ x: 0, y: 0, width: 20, height: 20 })
    const par = { ...newParallelogram({ x: 60, y: 0, width: 20, height: 20 }) }
    const out = flipElements([tri, par], [tri.id, par.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.get(tri.id)!.mirror).toEqual([-1, 1])
    expect(byId.get(par.id)!.mirror).toEqual([-1, 1])
    // combined bounds x 0..80 -> centre 40; tri centre 10 -> 70 -> x 60
    expect(byId.get(tri.id)!.x).toBe(60)
    expect(byId.get(par.id)!.x).toBe(0)
  })

  it("excludes a locked element from the result", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 })
    const locked = { ...newRectangle({ x: 100, y: 0, width: 20, height: 20 }), locked: true }
    const out = flipElements([a, locked], [a.id, locked.id], "x")
    expect(out.map((e) => e.id)).toEqual([a.id])
  })

  it("expands to frame members: flipping a frame + one loose rect reflects the frame's member too", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const loose = newRectangle({ x: 200, y: 0, width: 20, height: 20 })
    const out = flipElements([frame, member, loose], [frame.id, loose.id], "x")
    expect(out.map((e) => e.id).sort()).toEqual([frame.id, loose.id, member.id].sort())
  })

  it("a lone selected frame takes the group path and reflects its members", () => {
    const frame = newFrame({ x: 0, y: 0, width: 100, height: 100 })
    const member = { ...newRectangle({ x: 10, y: 10, width: 20, height: 20 }), frameId: frame.id }
    const out = flipElements([frame, member], [frame.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    // member centre 20 -> reflected across frame-closure combined-bounds centre 50 -> 80 -> x 70
    expect(byId.get(member.id)!.x).toBe(70)
    expect(byId.has(frame.id)).toBe(true)
  })

  it("does not flip a bound label dragged in by a marquee alongside its container", () => {
    // marquee around a labelled shape necessarily encloses the label too
    const { container, label } = labelledTriangle({ x: 0, y: 0, width: 100, height: 100 })
    const out = flipElements([container, label], [container.id, label.id], "y")
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.get(container.id)!.mirror).toEqual([1, -1])
    expect(byId.has(label.id)).toBe(false)
  })

  it("keeps the container's own box when only it and its label are selected", () => {
    const { container, label } = labelledTriangle({ x: 10, y: 20, width: 100, height: 100 })
    const out = flipElements([container, label], [container.id, label.id], "x")
    const c = out.find((e) => e.id === container.id)!
    expect([c.x, c.y, c.width, c.height]).toEqual([10, 20, 100, 100])
    expect(c.mirror).toEqual([-1, 1])
  })

  it("still flips a bound label selected on its own (spec §2: directly selected)", () => {
    const { container, label } = labelledTriangle({ x: 0, y: 0, width: 100, height: 100 })
    const [out] = flipElements([container, label], [label.id], "y")
    expect(out!.id).toBe(label.id)
    expect(out!.mirror).toEqual([1, -1])
  })

  it("the excluded label still counts toward the group's combined bounds", () => {
    // container at 0..100, plus a far rect: bounds unchanged by the contained label
    const { container, label } = labelledTriangle({ x: 0, y: 0, width: 100, height: 100 })
    const far = newRectangle({ x: 300, y: 0, width: 20, height: 20 })
    const out = flipElements([container, label, far], [container.id, label.id, far.id], "x")
    const byId = new Map(out.map((e) => [e.id, e]))
    // combined bounds x 0..320 -> centre 160; container centre 50 -> 270 -> x 220
    expect(byId.get(container.id)!.x).toBe(220)
    expect(byId.get(far.id)!.x).toBe(0)
    expect(byId.has(label.id)).toBe(false)
  })

  it("flips a bound label whose own container is not in the selection", () => {
    const { container, label } = labelledTriangle({ x: 0, y: 0, width: 100, height: 100 })
    const other = newRectangle({ x: 300, y: 0, width: 20, height: 20 })
    const out = flipElements([container, label, other], [label.id, other.id], "y")
    const byId = new Map(out.map((e) => [e.id, e]))
    expect(byId.get(label.id)!.mirror).toEqual([1, -1])
  })

  it("multi-flip is an involution for closed shapes", () => {
    const a = newRectangle({ x: 0, y: 0, width: 20, height: 20 })
    const b = newTriangle({ x: 100, y: 40, width: 40, height: 20 })
    const once = flipElements([a, b], [a.id, b.id], "y")
    const twice = flipElements(once, [a.id, b.id], "y")
    const byId = new Map(twice.map((e) => [e.id, e]))
    expect(byId.get(a.id)!.x).toBe(a.x)
    expect(byId.get(a.id)!.y).toBe(a.y)
    expect(byId.get(b.id)!.mirror).toBeUndefined()
    expect(byId.get(b.id)!.y).toBe(b.y)
  })
})
