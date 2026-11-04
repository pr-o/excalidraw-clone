import { rotatePoint, type Point } from "@excalidraw-clone/geometry"
import { describe, expect, it } from "vitest"
import { computeResize, type ResizeOrigin } from "../src/tools/selection/resize"

const NO_MODS = { shift: false, alt: false, ctrl: false, meta: false }

/** Scene position of a local point of a box rotated about its own centre. */
const sceneOf = (
  box: { x: number; y: number; width: number; height: number },
  angle: number,
  local: Point,
): Point =>
  rotatePoint(
    { x: box.x + local.x, y: box.y + local.y },
    {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    },
    angle,
  )

describe("computeResize on a rotated element", () => {
  const origin: ResizeOrigin = { x: 100, y: 100, width: 100, height: 50, angle: Math.PI / 2 }

  it("measures the drag along the element's own axes", () => {
    // Turned 90°, the element's local +x axis points down the screen: pulling the
    // SE handle straight down must widen it, not make it taller.
    const start = sceneOf(origin, origin.angle, { x: 100, y: 50 })
    const box = computeResize(origin, "se", start, { x: start.x, y: start.y + 20 }, NO_MODS)
    expect(box.width).toBeCloseTo(120)
    expect(box.height).toBeCloseTo(50)
  })

  it("keeps the opposite corner fixed on screen", () => {
    const start = sceneOf(origin, origin.angle, { x: 100, y: 50 })
    const anchorBefore = sceneOf(origin, origin.angle, { x: 0, y: 0 })
    const box = computeResize(origin, "se", start, { x: start.x + 10, y: start.y + 30 }, NO_MODS)
    const anchorAfter = sceneOf(box, origin.angle, { x: 0, y: 0 })
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x)
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y)
  })

  it("is unchanged for an unrotated element", () => {
    const flat: ResizeOrigin = { x: 0, y: 0, width: 100, height: 100, angle: 0 }
    expect(computeResize(flat, "se", { x: 100, y: 100 }, { x: 150, y: 130 }, NO_MODS)).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 130,
    })
  })
})
