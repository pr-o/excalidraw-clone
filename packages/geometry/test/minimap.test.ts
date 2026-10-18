import { describe, expect, it } from "vitest"
import {
  centerViewOn,
  minimapFit,
  minimapToScene,
  sceneToMinimap,
  viewportSceneRect,
} from "../src/minimap"

const view = { scrollX: -100, scrollY: -50, zoom: 2 }

describe("minimap math", () => {
  it("viewportSceneRect is the scene area visible in the viewport", () => {
    expect(viewportSceneRect(view, 800, 600)).toEqual({ x: 100, y: 50, width: 400, height: 300 })
  })

  it("fit covers content plus viewport with padding, and works with no content", () => {
    const rect = viewportSceneRect(view, 800, 600)
    const f = minimapFit({ x: 1000, y: 0, width: 100, height: 100 }, rect, 200, 140, 10)
    // union spans x 100..1100, y 0..350; scale limited by width: (200-20)/1000
    expect(f.scale).toBeCloseTo(0.18)
    const tl = sceneToMinimap({ x: 100, y: 0 }, f)
    const br = sceneToMinimap({ x: 1100, y: 350 }, f)
    expect(tl.x).toBeGreaterThanOrEqual(10 - 1e-9)
    expect(br.x).toBeLessThanOrEqual(190 + 1e-9)
    expect(br.y).toBeLessThanOrEqual(130 + 1e-9)
    expect(minimapFit(null, rect, 200, 140, 10).scale).toBeGreaterThan(0)
  })

  it("scene <-> minimap mapping round-trips", () => {
    const f = minimapFit(
      { x: -500, y: -500, width: 2000, height: 900 },
      viewportSceneRect(view, 800, 600),
      200,
      140,
      8,
    )
    const p = { x: 123.5, y: -77 }
    const back = minimapToScene(sceneToMinimap(p, f), f)
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it("centerViewOn puts the scene point at the viewport centre, keeping zoom", () => {
    const next = centerViewOn({ x: 1000, y: 400 }, view, 800, 600)
    expect(next.zoom).toBe(2)
    expect(viewportSceneRect(next, 800, 600)).toEqual({ x: 800, y: 250, width: 400, height: 300 })
  })
})
