import { describe, expect, it } from "vitest"
import { classifyDroppedFile, fitImageSize, isInsertableImage } from "../src/driver/insertFiles"

describe("fitImageSize", () => {
  it("keeps small images at their natural size", () => {
    expect(fitImageSize({ width: 120, height: 80 })).toEqual({ width: 120, height: 80 })
  })
  it("scales large images down to fit, keeping the aspect ratio", () => {
    expect(fitImageSize({ width: 2400, height: 1200 }, 600)).toEqual({ width: 600, height: 300 })
    expect(fitImageSize({ width: 300, height: 1500 }, 600)).toEqual({ width: 120, height: 600 })
  })
  it("gives a degenerate image a usable box", () => {
    expect(fitImageSize({ width: 0, height: 0 }, 600)).toEqual({ width: 300, height: 300 })
  })
})

describe("classifyDroppedFile", () => {
  const file = (name: string, type: string, body = "x") => new File([body], name, { type })
  it("recognises libraries, drawings and images", async () => {
    expect(await classifyDroppedFile(file("shapes.excalidrawlib", ""))).toBe("library")
    expect(await classifyDroppedFile(file("plan.excalidraw", ""))).toBe("scene")
    expect(await classifyDroppedFile(file("data.json", "application/json"))).toBe("scene")
    expect(await classifyDroppedFile(file("photo.jpg", "image/jpeg"))).toBe("image")
    expect(await classifyDroppedFile(file("notes.txt", "text/plain"))).toBe("unsupported")
  })
  it("treats a plain PNG (no embedded scene) as an image", async () => {
    expect(await classifyDroppedFile(file("shot.png", "image/png", "not really a png"))).toBe(
      "image",
    )
  })
  it("knows which blobs the canvas can draw", () => {
    expect(isInsertableImage(new Blob([], { type: "image/webp" }))).toBe(true)
    expect(isInsertableImage(new Blob([], { type: "application/pdf" }))).toBe(false)
  })
})
