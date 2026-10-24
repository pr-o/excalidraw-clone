import { newRectangle, newTable, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { buildGroupResizeMoveEffect } from "../src/tools/selection/group-resize"
import {
  anchorSides,
  buildResizeMoveEffect,
  snapshotElementBox,
} from "../src/tools/selection/resize"

const NO_MODS = { shift: false, alt: false, ctrl: false, meta: false }

const run = (effect: ReturnType<typeof buildResizeMoveEffect>, draft: ExcalidrawElement[]) => {
  if (effect.kind === "mutation") effect.apply(draft)
  return draft
}

describe("table resize keeps the anchored corner when min sizes clamp", () => {
  // 360x120 table at (100,100): min size 120x84; anchor corner (se) = (460,220)
  const table = () => ({ ...newTable({ x: 100, y: 100 }), id: "T" })

  it("nw handle dragged past the minimum: bottom-right stays fixed", () => {
    const t = table()
    const draft = run(
      buildResizeMoveEffect(
        "T",
        snapshotElementBox(t),
        "nw",
        { x: 100, y: 100 },
        { x: 440, y: 200 },
        NO_MODS,
      ),
      [t],
    )
    const out = draft[0]!
    expect([out.width, out.height]).toEqual([120, 84])
    expect([out.x + out.width, out.y + out.height]).toEqual([460, 220])
  })

  it("se handle dragged past the minimum keeps the top-left", () => {
    const t = table()
    const out = run(
      buildResizeMoveEffect(
        "T",
        snapshotElementBox(t),
        "se",
        { x: 460, y: 220 },
        { x: 110, y: 110 },
        NO_MODS,
      ),
      [t],
    )[0]!
    expect([out.x, out.y]).toEqual([100, 100])
  })

  it("anchorSides follows a drag that crosses over the anchor", () => {
    const origin = { x: 0, y: 0, width: 100, height: 100, angle: 0 }
    expect(anchorSides(origin, "nw", { x: 20, y: 20, width: 80, height: 80 })).toEqual({
      x: "end",
      y: "end",
    })
    // w handle dragged right past the right edge: box now starts at the old right edge
    expect(anchorSides(origin, "w", { x: 100, y: 0, width: 30, height: 100 })).toEqual({
      x: "start",
      y: "start",
    })
    expect(anchorSides(origin, "w", { x: 100, y: 0, width: 0, height: 100 }).x).toBe("end")
  })

  it("group resize from the nw handle keeps the table against the fixed corner", () => {
    const t = { ...newTable({ x: 0, y: 0 }), id: "T" }
    const r = { ...newRectangle({ x: 0, y: 0, width: 360, height: 120 }), id: "R" }
    const elements: ExcalidrawElement[] = [t, r]
    const origin = { x: 0, y: 0, width: 360, height: 120, angle: 0 }
    const effect = buildGroupResizeMoveEffect(
      ["T", "R"],
      elements,
      origin,
      "nw",
      { x: 0, y: 0 },
      { x: 340, y: 110 },
      NO_MODS,
    )
    const draft = [...elements]
    if (effect.kind === "mutation") effect.apply(draft)
    const out = draft[0]!
    expect([out.x + out.width, out.y + out.height]).toEqual([360, 120])
  })
})
