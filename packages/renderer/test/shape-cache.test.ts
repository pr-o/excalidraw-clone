import { newRectangle } from "@excalidraw-clone/scene"
import { RoughGenerator } from "roughjs/bin/generator"
import { describe, expect, it, vi } from "vitest"
import { ShapeCache } from "../src/shape-cache"

describe("ShapeCache", () => {
  it("returns the same drawables array for two calls with identical element identity", () => {
    const cache = new ShapeCache()
    const gen = new RoughGenerator()
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const a = cache.get(r, gen)
    const b = cache.get(r, gen)
    expect(b).toBe(a)
  })

  it("calls the generator only once per element identity (cache hit)", () => {
    const cache = new ShapeCache()
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "rectangle")
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    cache.get(r, gen)
    cache.get(r, gen)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("treats a new element identity as a cache miss", () => {
    const cache = new ShapeCache()
    const gen = new RoughGenerator()
    const r1 = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    const r2 = { ...r1, versionNonce: r1.versionNonce + 1 }
    cache.get(r1, gen)
    const a = cache.get(r2, gen)
    const b = cache.get(r2, gen)
    expect(b).toBe(a)
  })

  it("clear() drops cached entries", () => {
    const cache = new ShapeCache()
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "rectangle")
    const r = newRectangle({ x: 0, y: 0, width: 50, height: 50 })
    cache.get(r, gen)
    cache.clear()
    cache.get(r, gen)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
