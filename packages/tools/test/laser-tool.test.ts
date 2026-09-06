import { describe, expect, it } from "vitest"
import { laserTool } from "../src"
import { makeCtx, point } from "./test-utils"

describe("laser tool", () => {
  it("pointerDown emits a single laserMove effect carrying the point", () => {
    const [state, effects] = laserTool.reduce(
      laserTool.initial,
      { type: "pointerDown", at: point(12, 34) },
      makeCtx(),
    )
    expect(state).toBe(laserTool.initial)
    expect(effects).toEqual([{ kind: "laserMove", at: { x: 12, y: 34 } }])
  })

  it("pointerMove emits a single laserMove effect carrying the point", () => {
    const [, effects] = laserTool.reduce(
      laserTool.initial,
      { type: "pointerMove", at: point(5, 6) },
      makeCtx(),
    )
    expect(effects).toEqual([{ kind: "laserMove", at: { x: 5, y: 6 } }])
  })

  it("pointerUp / escape / doubleClick emit no effects and keep state identity", () => {
    for (const event of [
      { type: "pointerUp", at: point(0, 0) },
      { type: "escape" },
      { type: "doubleClick", at: point(0, 0) },
    ] as const) {
      const [state, effects] = laserTool.reduce(laserTool.initial, event, makeCtx())
      expect(state).toBe(laserTool.initial)
      expect(effects).toEqual([])
    }
  })
})
