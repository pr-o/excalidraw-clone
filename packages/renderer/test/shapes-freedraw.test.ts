import { newFreedraw } from "@excalidraw-clone/scene"
import { RoughGenerator } from "roughjs/bin/generator"
import { describe, expect, it, vi } from "vitest"
import { freedrawShape } from "../src/shapes/freedraw"

describe("freedrawShape", () => {
  it("calls gen.curve with the absolute polyline + seed", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "curve")
    const f = {
      ...newFreedraw({ x: 0, y: 0 }),
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 1 },
        { x: 10, y: 0 },
      ],
    }
    freedrawShape(f, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [pts, opts] = spy.mock.calls[0]!
    expect(pts).toEqual([
      [0, 0],
      [5, 1],
      [10, 0],
    ])
    expect(opts?.seed).toBe(f.seed)
  })

  it("returns no drawables for fewer than 2 points", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "curve")
    const empty = { ...newFreedraw({ x: 0, y: 0 }) }
    expect(freedrawShape(empty, gen)).toEqual([])
    const single = {
      ...newFreedraw({ x: 0, y: 0 }),
      points: [{ x: 0, y: 0 }],
    }
    expect(freedrawShape(single, gen)).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
