import { newArrow } from "@excalidraw-clone/scene"
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  buildBendInsertEffect,
  buildBendMoveEffect,
  buildBendRemoveEffect,
  buildBendRevertEffect,
} from "../src/tools/selection/bend"
import { snapshotLinear } from "../src/tools/selection/endpoint"
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

const abs = (a: ExcalidrawArrowElement, i: number) => ({
  x: a.x + a.points[i]!.x,
  y: a.y + a.points[i]!.y,
})

describe("bend insert", () => {
  it("splices a new point at the given index", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 40 })], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(3)
    expect(abs(a, 1)).toEqual({ x: 50, y: 40 })
  })
})

describe("bend move", () => {
  it("repositions an interior point", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 40 })], draft)
    applyMutation([buildBendMoveEffect("ar", 1, { x: 70, y: 90 })], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(abs(a, 1)).toEqual({ x: 70, y: 90 })
  })
})

describe("bend remove", () => {
  it("removes an interior point and rejoins neighbors", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 40 })], draft)
    applyMutation([buildBendRemoveEffect("ar", 1)], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(2)
    expect(abs(a, 0)).toEqual({ x: 0, y: 0 })
    expect(abs(a, 1)).toEqual({ x: 100, y: 0 })
  })

  it("is a no-op at 2 points", () => {
    const draft: ExcalidrawElement[] = [arrow()]
    applyMutation([buildBendRemoveEffect("ar", 1)], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(2)
  })
})

describe("bend revert", () => {
  it("restores the original geometry", () => {
    const a0 = arrow()
    const origin = snapshotLinear(a0)
    const draft: ExcalidrawElement[] = [a0]
    applyMutation([buildBendInsertEffect("ar", 1, { x: 50, y: 999 })], draft)
    applyMutation([buildBendRevertEffect("ar", origin)], draft)
    const a = draft[0] as ExcalidrawArrowElement
    expect(a.points.length).toBe(2)
    expect(abs(a, 1)).toEqual({ x: 100, y: 0 })
  })
})
