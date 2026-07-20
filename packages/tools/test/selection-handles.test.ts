import { newArrow, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { findHandleAt } from "../src"
import { IDENTITY_VIEW } from "./test-utils"

const horizontalArrow = (): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  id: "ar",
  x: 0,
  y: 0,
  width: 100,
  height: 0,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
})

describe("findHandleAt — linear endpoints", () => {
  it("hits the start endpoint", () => {
    const a = horizontalArrow()
    const hit = findHandleAt({ x: 0, y: 0 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "endpoint", elementId: "ar", end: "start" })
  })

  it("hits the end endpoint", () => {
    const a = horizontalArrow()
    const hit = findHandleAt({ x: 100, y: 0 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "endpoint", elementId: "ar", end: "end" })
  })

  it("never returns resize/rotate handles for a linear element", () => {
    const a = horizontalArrow()
    // off-body point (not near any endpoint or segment midpoint): a miss, no resize box
    expect(findHandleAt({ x: 50, y: 40 }, [a.id], [a], IDENTITY_VIEW)).toBeNull()
  })

  it("still returns resize handles for a rectangle", () => {
    const r: ExcalidrawElement = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const hit = findHandleAt({ x: 100, y: 100 }, [r.id], [r], IDENTITY_VIEW)
    expect(hit?.kind).toBe("resize")
  })
})

const bentArrow = (): ExcalidrawArrowElement => ({
  ...newArrow({ x: 0, y: 0 }),
  id: "ar",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 0 },
  ],
})

describe("findHandleAt — bend points", () => {
  it("hits an interior point as a bend", () => {
    const a = bentArrow()
    const hit = findHandleAt({ x: 100, y: 100 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "bend", elementId: "ar", index: 1 })
  })

  it("endpoints still win over interior/segment hits", () => {
    const a = bentArrow()
    expect(findHandleAt({ x: 0, y: 0 }, [a.id], [a], IDENTITY_VIEW)).toEqual({
      kind: "endpoint",
      elementId: "ar",
      end: "start",
    })
    expect(findHandleAt({ x: 200, y: 0 }, [a.id], [a], IDENTITY_VIEW)).toEqual({
      kind: "endpoint",
      elementId: "ar",
      end: "end",
    })
  })

  it("hits a segment midpoint as bendAdd", () => {
    const a = bentArrow()
    // midpoint of segment 0: between (0,0) and (100,100) => (50,50)
    const hit = findHandleAt({ x: 50, y: 50 }, [a.id], [a], IDENTITY_VIEW)
    expect(hit).toEqual({ kind: "bendAdd", elementId: "ar", segmentIndex: 0, at: { x: 50, y: 50 } })
  })

  it("elbowed arrows expose endpoint handles but no bend/bendAdd handles", () => {
    const arrow: ExcalidrawArrowElement = {
      ...newArrow({ x: 0, y: 0, elbowed: true }),
      id: "ar",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
      ],
    }
    const view = IDENTITY_VIEW
    // interior vertex (100,0) would be a bend handle on a sharp arrow
    expect(findHandleAt({ x: 100, y: 0 }, [arrow.id], [arrow], view)).toBeNull()
    // segment midpoint (50,0) would be a bendAdd handle on a sharp arrow
    expect(findHandleAt({ x: 50, y: 0 }, [arrow.id], [arrow], view)).toBeNull()
    // endpoints still live
    expect(findHandleAt({ x: 0, y: 0 }, [arrow.id], [arrow], view)).toEqual({
      kind: "endpoint",
      elementId: arrow.id,
      end: "start",
    })
  })
})
