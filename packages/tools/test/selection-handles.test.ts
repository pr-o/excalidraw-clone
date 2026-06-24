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
    // mid-body point: not an endpoint, must be a miss (no resize box)
    expect(findHandleAt({ x: 50, y: 0 }, [a.id], [a], IDENTITY_VIEW)).toBeNull()
  })

  it("still returns resize handles for a rectangle", () => {
    const r: ExcalidrawElement = newRectangle({ x: 0, y: 0, width: 100, height: 100 })
    const hit = findHandleAt({ x: 100, y: 100 }, [r.id], [r], IDENTITY_VIEW)
    expect(hit?.kind).toBe("resize")
  })
})
