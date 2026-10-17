import { describe, expect, it, vi } from "vitest"
import { Scene } from "../src/scene"

describe("Scene user guides", () => {
  it("defaults to no guides and accepts initial guides", () => {
    expect(new Scene().getGuides()).toEqual({ x: [], y: [] })
    expect(new Scene([], { x: [1], y: [2] }).getGuides()).toEqual({ x: [1], y: [2] })
  })

  it("setGuides notifies subscribers without touching undo history", () => {
    const scene = new Scene()
    const fn = vi.fn()
    scene.subscribe(fn)
    scene.setGuides({ x: [10], y: [] })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(scene.getGuides()).toEqual({ x: [10], y: [] })
    expect(scene.canUndo()).toBe(false)
    scene.undo()
    expect(scene.getGuides()).toEqual({ x: [10], y: [] })
  })
})
