import { describe, expect, it } from "vitest"
import { newImage, newRectangle } from "../src/factories"
import { resetCrop } from "../src/reset-crop"

const cropped = (over = {}) => ({
  ...newImage({ x: 20, y: 0, width: 80, height: 100 }),
  crop: { x: 0.2, y: 0, width: 0.8, height: 1 },
  ...over,
})

describe("resetCrop", () => {
  it("grows the box back to the full image, visible pixels fixed", () => {
    const img = cropped()
    const [r] = resetCrop([img], [img.id])
    expect(r).toMatchObject({ x: 0, y: 0, width: 100, height: 100, crop: null })
  })

  it("mirrored: the hidden strip is on the other side", () => {
    const img = cropped({ mirror: [-1, 1] })
    const [r] = resetCrop([img], [img.id])
    // visible region is the image's right 80%, drawn flipped => hidden 20% sits at box right
    expect(r).toMatchObject({ x: 20, width: 100, crop: null })
  })

  it("rotated: keeps the visible region fixed in world space", () => {
    const img = cropped({ x: 10, y: 10, width: 80, height: 100, angle: Math.PI / 2 })
    const [r] = resetCrop([img], [img.id])
    // old centre (50,60) moves 10 along local -x => world -y; full box 100x100
    expect(r!.width).toBeCloseTo(100)
    expect(r!.x + r!.width / 2).toBeCloseTo(50)
    expect(r!.y + r!.height / 2).toBeCloseTo(50)
  })

  it("skips uncropped, locked, deleted, non-image and unknown ids", () => {
    const plain = newImage({ x: 0, y: 0, width: 10, height: 10 })
    const locked = cropped({ locked: true })
    const gone = cropped({ isDeleted: true })
    const rect = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    expect(
      resetCrop([plain, locked, gone, rect], [plain.id, locked.id, gone.id, rect.id, "?"]),
    ).toEqual([])
  })
})
