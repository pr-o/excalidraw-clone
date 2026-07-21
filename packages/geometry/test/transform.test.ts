import { describe, expect, it } from "vitest"
import { sceneToViewport, viewportToScene, zoomToPoint, ZOOM_MIN, ZOOM_MAX } from "../src"
import type { Point, ViewTransform } from "../src"

const expectClose = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x)
  expect(a.y).toBeCloseTo(b.y)
}

describe("sceneToViewport", () => {
  it("identity transform leaves points unchanged", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    expectClose(sceneToViewport({ x: 7, y: -3 }, t), { x: 7, y: -3 })
  })

  it("pure scroll shifts points by scroll", () => {
    const t: ViewTransform = { scrollX: 10, scrollY: 20, zoom: 1 }
    expectClose(sceneToViewport({ x: 0, y: 0 }, t), { x: 10, y: 20 })
    expectClose(sceneToViewport({ x: 5, y: 5 }, t), { x: 15, y: 25 })
  })

  it("pure zoom scales around the origin", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 2 }
    expectClose(sceneToViewport({ x: 3, y: 4 }, t), { x: 6, y: 8 })
  })

  it("zoom 0.5 halves coordinates", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 0.5 }
    expectClose(sceneToViewport({ x: 10, y: 20 }, t), { x: 5, y: 10 })
  })

  it("scroll then zoom: viewport = (scene + scroll) * zoom", () => {
    const t: ViewTransform = { scrollX: 1, scrollY: 2, zoom: 3 }
    expectClose(sceneToViewport({ x: 4, y: 5 }, t), { x: 15, y: 21 })
  })
})

describe("viewportToScene", () => {
  it("identity transform leaves points unchanged", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    expectClose(viewportToScene({ x: 7, y: -3 }, t), { x: 7, y: -3 })
  })

  it("inverse of sceneToViewport with pure scroll", () => {
    const t: ViewTransform = { scrollX: 10, scrollY: 20, zoom: 1 }
    expectClose(viewportToScene({ x: 10, y: 20 }, t), { x: 0, y: 0 })
  })

  it("inverse of sceneToViewport with pure zoom", () => {
    const t: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 2 }
    expectClose(viewportToScene({ x: 6, y: 8 }, t), { x: 3, y: 4 })
  })
})

describe("scene ↔ viewport round-trip", () => {
  const cases: { name: string; t: ViewTransform; p: Point }[] = [
    { name: "identity", t: { scrollX: 0, scrollY: 0, zoom: 1 }, p: { x: 0, y: 0 } },
    { name: "arbitrary", t: { scrollX: 7, scrollY: -11, zoom: 1.5 }, p: { x: 13, y: -5 } },
    { name: "small zoom", t: { scrollX: 100, scrollY: 50, zoom: 0.25 }, p: { x: -300, y: 200 } },
    { name: "large zoom", t: { scrollX: -10, scrollY: 5, zoom: 8 }, p: { x: 1.5, y: 2.25 } },
  ]

  it.each(cases)("viewportToScene(sceneToViewport(p)) ≈ p [$name]", ({ t, p }) => {
    expectClose(viewportToScene(sceneToViewport(p, t), t), p)
  })

  it.each(cases)("sceneToViewport(viewportToScene(p)) ≈ p [$name]", ({ t, p }) => {
    expectClose(sceneToViewport(viewportToScene(p, t), t), p)
  })
})

describe("zoomToPoint", () => {
  it("keeps the anchor's scene point fixed on screen when zooming in", () => {
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const anchor: Point = { x: 100, y: 50 }
    const scenePointBefore = viewportToScene(anchor, view)
    const next = zoomToPoint(view, anchor, 2)
    expect(next.zoom).toBe(2)
    expectClose(sceneToViewport(scenePointBefore, next), anchor)
  })

  it("keeps the anchor's scene point fixed on screen when zooming out", () => {
    const view: ViewTransform = { scrollX: 7, scrollY: -3, zoom: 2 }
    const anchor: Point = { x: 40, y: 30 }
    const scenePointBefore = viewportToScene(anchor, view)
    const next = zoomToPoint(view, anchor, 0.5)
    expect(next.zoom).toBe(0.5)
    expectClose(sceneToViewport(scenePointBefore, next), anchor)
  })

  it("is a no-op on scroll when targetZoom equals the current zoom", () => {
    const view: ViewTransform = { scrollX: 5, scrollY: 3, zoom: 2 }
    const anchor: Point = { x: 12, y: 8 }
    const next = zoomToPoint(view, anchor, 2)
    expect(next.zoom).toBe(2)
    expectClose({ x: next.scrollX, y: next.scrollY }, { x: view.scrollX, y: view.scrollY })
  })

  it("clamps to ZOOM_MAX and still anchors at the clamped zoom", () => {
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const anchor: Point = { x: 10, y: 10 }
    const scenePointBefore = viewportToScene(anchor, view)
    const next = zoomToPoint(view, anchor, 999)
    expect(next.zoom).toBe(ZOOM_MAX)
    expectClose(sceneToViewport(scenePointBefore, next), anchor)
  })

  it("clamps to ZOOM_MIN", () => {
    const view: ViewTransform = { scrollX: 0, scrollY: 0, zoom: 1 }
    const anchor: Point = { x: 10, y: 10 }
    const next = zoomToPoint(view, anchor, 0.0001)
    expect(next.zoom).toBe(ZOOM_MIN)
  })
})
