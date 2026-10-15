import { newImage } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { computeCrop, type CropOrigin } from "../src/tools/selection/crop"

const origin = (over: Partial<CropOrigin> = {}): CropOrigin => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  angle: 0,
  crop: null,
  mirror: [1, 1],
  ...over,
})
const p = (x: number, y: number) => ({ x, y })

describe("computeCrop", () => {
  it("west handle inward trims the left and moves the box", () => {
    const r = computeCrop(origin(), "w", p(0, 50), p(20, 50))
    expect(r).toEqual({
      x: 20,
      y: 0,
      width: 80,
      height: 100,
      crop: { x: 0.2, y: 0, width: 0.8, height: 1 },
    })
  })

  it("east handle inward trims the right", () => {
    const r = computeCrop(origin(), "e", p(100, 50), p(70, 50))
    expect(r.width).toBe(70)
    expect(r.crop).toEqual({ x: 0, y: 0, width: 0.7, height: 1 })
  })

  it("cannot expand past the uncropped image", () => {
    const r = computeCrop(origin(), "e", p(100, 50), p(150, 50))
    expect(r.width).toBe(100)
    expect(r.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it("re-crop can expand back out to the full image but no further", () => {
    const cropped = origin({ x: 20, width: 80, crop: { x: 0.2, y: 0, width: 0.8, height: 1 } })
    const r = computeCrop(cropped, "w", p(20, 50), p(-50, 50))
    expect(r.x).toBeCloseTo(0)
    expect(r.width).toBeCloseTo(100)
    expect(r.crop.x).toBeCloseTo(0)
    expect(r.crop.width).toBeCloseTo(1)
  })

  it("clamps to the minimum size instead of crossing the opposite edge", () => {
    const r = computeCrop(origin(), "w", p(0, 50), p(500, 50))
    expect(r.width).toBe(10)
    expect(r.x).toBe(90)
  })

  it("corner handle crops both axes", () => {
    const r = computeCrop(origin(), "nw", p(0, 0), p(10, 30))
    expect(r).toMatchObject({ x: 10, y: 30, width: 90, height: 70 })
    expect(r.crop).toEqual({ x: 0.1, y: 0.3, width: 0.9, height: 0.7 })
  })

  it("rotated: the opposite edge stays fixed in world space", () => {
    // 90deg about centre (50,50): local +x points to scene +y.
    const r = computeCrop(origin({ angle: Math.PI / 2 }), "w", p(0, 50), p(0, 70))
    expect(r.width).toBeCloseTo(80)
    expect(r.height).toBeCloseTo(100)
    // New centre (50,60); unrotated box 80x100 => x = 50 - 40.
    expect(r.x).toBeCloseTo(10)
    expect(r.y).toBeCloseTo(10)
  })

  it("mirrored: screen-left handle trims the image's right side", () => {
    const r = computeCrop(origin({ mirror: [-1, 1] }), "w", p(0, 50), p(20, 50))
    expect(r.width).toBe(80)
    expect(r.crop.x).toBeCloseTo(0)
    expect(r.crop.width).toBeCloseTo(0.8)
  })

  it("snapshotCrop-compatible origin works for a real image element", () => {
    const el = newImage({ x: 0, y: 0, width: 100, height: 100, fileId: "f" })
    const r = computeCrop({ ...origin(), crop: el.crop }, "s", p(50, 100), p(50, 60))
    expect(r.crop.height).toBeCloseTo(0.6)
  })
})
