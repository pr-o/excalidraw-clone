import { BINDING_GAP, newArrow, newRectangle } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  buildEndpointCommitEffect,
  buildEndpointMoveEffect,
  buildEndpointRevertEffect,
  snapshotLinear,
} from "../src/tools/selection/endpoint"
import { applyMutation } from "./test-utils"

const arrow = (): ExcalidrawArrowElement => ({
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

const absEnd = (a: ExcalidrawArrowElement) => ({
  x: a.x + a.points[a.points.length - 1]!.x,
  y: a.y + a.points[a.points.length - 1]!.y,
})

describe("endpoint move", () => {
  it("moves the end endpoint to the new scene point", () => {
    const a = arrow()
    const draft: ExcalidrawElement[] = [a]
    applyMutation([buildEndpointMoveEffect("ar", "end", { x: 200, y: 60 })], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(absEnd(e)).toEqual({ x: 200, y: 60 })
  })

  it("clears the dragged end binding while moving", () => {
    const a = { ...arrow(), endBinding: { elementId: "t", focus: 0, gap: BINDING_GAP } }
    const t = { ...newRectangle({ x: 300, y: 0, width: 100, height: 100 }), id: "t" }
    const draft: ExcalidrawElement[] = [t, a]
    applyMutation([buildEndpointMoveEffect("ar", "end", { x: 50, y: 50 })], draft)
    const e = draft.find((x) => x.id === "ar") as ExcalidrawArrowElement
    expect(e.endBinding).toBeNull()
  })
})

describe("endpoint commit", () => {
  it("binds the dragged end to the shape it lands on and adds a back-ref", () => {
    const t = { ...newRectangle({ x: 200, y: 0, width: 100, height: 100 }), id: "t" }
    // end endpoint sits inside t (center 250,50)
    const a = {
      ...arrow(),
      x: 0,
      y: 50,
      points: [
        { x: 0, y: 0 },
        { x: 250, y: 0 },
      ],
      width: 250,
    }
    const draft: ExcalidrawElement[] = [t, a]
    applyMutation([buildEndpointCommitEffect("ar", "end")], draft)
    const e = draft.find((x) => x.id === "ar") as ExcalidrawArrowElement
    expect(e.endBinding?.elementId).toBe("t")
    const target = draft.find((x) => x.id === "t")!
    expect(target.boundElements?.some((b) => b.id === "ar")).toBe(true)
  })

  it("leaves the end unbound when it lands on empty space", () => {
    const a = {
      ...arrow(),
      points: [
        { x: 0, y: 0 },
        { x: 999, y: 999 },
      ],
      width: 999,
      height: 999,
    }
    const draft: ExcalidrawElement[] = [a]
    applyMutation([buildEndpointCommitEffect("ar", "end")], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(e.endBinding).toBeNull()
  })
})

describe("endpoint revert", () => {
  it("restores the original geometry and binding", () => {
    const a = arrow()
    const origin = snapshotLinear(a)
    const draft: ExcalidrawElement[] = [a]
    applyMutation([buildEndpointMoveEffect("ar", "end", { x: 999, y: 999 })], draft)
    applyMutation([buildEndpointRevertEffect("ar", origin)], draft)
    const e = draft[0] as ExcalidrawArrowElement
    expect(absEnd(e)).toEqual({ x: 100, y: 0 })
  })
})
