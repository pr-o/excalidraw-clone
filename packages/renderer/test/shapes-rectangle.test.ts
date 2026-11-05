import { newRectangle } from "@excalidraw-clone/scene"
import { RoughGenerator } from "roughjs/bin/generator"
import { describe, expect, it, vi } from "vitest"
import { rectangleShape } from "../src/shapes/rectangle"
import { filledShapeOptions } from "../src/shapes/options"

describe("rectangleShape", () => {
  it("calls gen.rectangle with element width/height and seed", () => {
    const gen = new RoughGenerator()
    const spy = vi.spyOn(gen, "rectangle")
    const r = newRectangle({ x: 5, y: 6, width: 30, height: 40 })
    rectangleShape(r, gen)
    expect(spy).toHaveBeenCalledOnce()
    const [x, y, w, h, opts] = spy.mock.calls[0]!
    expect(x).toBe(0)
    expect(y).toBe(0)
    expect(w).toBe(30)
    expect(h).toBe(40)
    expect(opts?.seed).toBe(r.seed)
    expect(opts?.stroke).toBe(r.strokeColor)
    expect(opts?.strokeWidth).toBe(r.strokeWidth)
  })

  it("transparent backgroundColor produces no fill option", () => {
    const r = newRectangle({ x: 0, y: 0, backgroundColor: "transparent" })
    expect(filledShapeOptions(r).fill).toBeUndefined()
  })

  it("non-transparent backgroundColor passes fill", () => {
    const r = newRectangle({ x: 0, y: 0, backgroundColor: "#ff00ff" })
    expect(filledShapeOptions(r).fill).toBe("#ff00ff")
  })
})

describe("rectangleShape roundness", () => {
  it("sharp (roundness null) calls gen.rectangle", () => {
    const gen = new RoughGenerator()
    const rectSpy = vi.spyOn(gen, "rectangle")
    const pathSpy = vi.spyOn(gen, "path")
    const r = newRectangle({ x: 0, y: 0, width: 30, height: 20 })
    rectangleShape(r, gen)
    expect(rectSpy).toHaveBeenCalledOnce()
    expect(pathSpy).not.toHaveBeenCalled()
  })

  it("round (roundness {type:1}) calls gen.path instead", () => {
    const gen = new RoughGenerator()
    const rectSpy = vi.spyOn(gen, "rectangle")
    const pathSpy = vi.spyOn(gen, "path")
    const r = {
      ...newRectangle({ x: 0, y: 0, width: 30, height: 20 }),
      roundness: { type: 1 as const },
    }
    rectangleShape(r, gen)
    expect(pathSpy).toHaveBeenCalledOnce()
    expect(rectSpy).not.toHaveBeenCalled()
  })
})
