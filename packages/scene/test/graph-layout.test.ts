import { describe, expect, it } from "vitest"
import { getElementBounds } from "../src/bounds"
import { newArrow, newRectangle } from "../src/factories"
import { graphEdges, layoutGraph, straightenConnectors } from "../src/graph-layout"
import type { ExcalidrawElement } from "../src/types"

const box = (x: number, y: number, w = 100, h = 50) => newRectangle({ x, y, width: w, height: h })

const link = (from: ExcalidrawElement, to: ExcalidrawElement) => ({
  ...newArrow({ x: 0, y: 0 }),
  startBinding: { elementId: from.id, focus: 0, gap: 4 },
  endBinding: { elementId: to.id, focus: 0, gap: 4 },
})

/** Applies position patches and returns the resulting bounds by id. */
const apply = (els: ExcalidrawElement[], patches: { id: string; x: number; y: number }[]) => {
  const by = new Map(patches.map((p) => [p.id, p]))
  return new Map(
    els.map((el) => {
      const p = by.get(el.id)
      return [el.id, getElementBounds(p ? { ...el, x: p.x, y: p.y } : el)]
    }),
  )
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe("graphEdges", () => {
  it("keeps only arrows bound at both ends to two different selected nodes", () => {
    const a = box(0, 0)
    const b = box(0, 0)
    const c = box(0, 0)
    const ab = link(a, b)
    const ac = link(a, c)
    const loop = link(a, a)
    const dangling = { ...newArrow({ x: 0, y: 0 }), startBinding: ab.startBinding }
    const edges = graphEdges([a, b], [a, b, c, ab, ac, loop, dangling])
    expect(edges.map((e) => e.arrowId)).toEqual([ab.id])
  })
})

describe("layoutGraph", () => {
  it("returns [] without connecting arrows or with a single node", () => {
    const a = box(0, 0)
    const b = box(300, 0)
    expect(layoutGraph([a, b], [a, b], "tree-down")).toEqual([])
    expect(layoutGraph([a], [a], "tree-down")).toEqual([])
  })

  it("tree-down puts successors on lower layers, centered under their parent", () => {
    const root = box(500, 400)
    const l = box(0, 0)
    const r = box(900, 900)
    const els = [root, l, r, link(root, l), link(root, r)]
    const b = apply(els, layoutGraph([root, l, r], els, "tree-down"))
    const rb = b.get(root.id)!
    const lb = b.get(l.id)!
    const rr = b.get(r.id)!
    expect(lb.y).toBeGreaterThan(rb.y + rb.height)
    expect(lb.y).toBe(rr.y)
    // The parent is centered over its two children.
    expect(rb.x + rb.width / 2).toBeCloseTo((lb.x + rr.x + rr.width) / 2)
    expect(overlaps(lb, rr)).toBe(false)
  })

  it("tree-right flows along the x axis", () => {
    const a = box(0, 300)
    const b = box(0, 0)
    const c = box(0, 700)
    const els = [a, b, c, link(a, b), link(b, c)]
    const out = apply(els, layoutGraph([a, b, c], els, "tree-right"))
    expect(out.get(a.id)!.x).toBeLessThan(out.get(b.id)!.x)
    expect(out.get(b.id)!.x).toBeLessThan(out.get(c.id)!.x)
  })

  it("keeps the selection's original top-left corner", () => {
    const a = box(200, 300)
    const b = box(900, 600)
    const els = [a, b, link(a, b)]
    const out = apply(els, layoutGraph([a, b], els, "tree-down"))
    const placed = [a, b].map((e) => out.get(e.id)!)
    const left = Math.min(...placed.map((v) => v.x))
    const top = Math.min(...placed.map((v) => v.y))
    expect(left).toBe(200)
    expect(top).toBe(300)
  })

  it("uses the longest path for layering and survives cycles", () => {
    const a = box(0, 0)
    const b = box(0, 0)
    const c = box(0, 0)
    // a -> b -> c, a -> c, and a back edge c -> a.
    const els = [a, b, c, link(a, b), link(b, c), link(a, c), link(c, a)]
    const out = apply(els, layoutGraph([a, b, c], els, "tree-down"))
    expect(out.get(a.id)!.y).toBeLessThan(out.get(b.id)!.y)
    expect(out.get(b.id)!.y).toBeLessThan(out.get(c.id)!.y)
  })

  it("lays disconnected components out side by side without overlap", () => {
    const a = box(0, 0)
    const b = box(0, 0)
    const c = box(0, 0)
    const d = box(0, 0)
    const els = [a, b, c, d, link(a, b), link(c, d)]
    const out = apply(els, layoutGraph([a, b, c, d], els, "tree-down"))
    const all = [a, b, c, d].map((e) => out.get(e.id)!)
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) expect(overlaps(all[i]!, all[j]!)).toBe(false)
    }
  })

  it("radial puts the root in the middle with neighbours around it, no overlaps", () => {
    const hub = box(0, 0)
    const spokes = [box(0, 0), box(0, 0), box(0, 0), box(0, 0), box(0, 0)]
    const els = [hub, ...spokes, ...spokes.map((s) => link(hub, s))]
    const out = apply(els, layoutGraph([hub, ...spokes], els, "radial"))
    const hb = out.get(hub.id)!
    const hc = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }
    const dists = spokes.map((s) => {
      const sb = out.get(s.id)!
      return Math.hypot(sb.x + sb.width / 2 - hc.x, sb.y + sb.height / 2 - hc.y)
    })
    for (const d of dists) expect(d).toBeCloseTo(dists[0]!)
    expect(dists[0]).toBeGreaterThan(100)
    const all = [hub, ...spokes].map((e) => out.get(e.id)!)
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) expect(overlaps(all[i]!, all[j]!)).toBe(false)
    }
  })

  it("radial places depth-2 nodes on a larger ring than depth-1", () => {
    const a = box(0, 0)
    const b = box(0, 0)
    const c = box(0, 0)
    const els = [a, b, c, link(a, b), link(b, c)]
    const out = apply(els, layoutGraph([a, b, c], els, "radial"))
    const dist = (id: string) => {
      const ab = out.get(a.id)!
      const v = out.get(id)!
      return Math.hypot(v.x - ab.x, v.y - ab.y)
    }
    expect(dist(c.id)).toBeGreaterThan(dist(b.id))
  })
})

describe("straightenConnectors", () => {
  it("collapses bent, non-elbowed connecting arrows to their end points", () => {
    const a = box(0, 0)
    const b = box(300, 0)
    const bent = {
      ...link(a, b),
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 0 },
      ],
    }
    const elbow = { ...bent, id: "e", elbowed: true }
    const out = straightenConnectors([a, b, bent, elbow], new Set([a.id, b.id]))
    expect(out).toHaveLength(1)
    expect(out[0]!.type === "arrow" && out[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
  })
})
