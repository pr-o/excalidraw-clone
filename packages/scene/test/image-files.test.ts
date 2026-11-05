import { describe, expect, it } from "vitest"
import { newImage, newRectangle } from "../src/factories"
import { imageFileIds } from "../src/image-files"

describe("imageFileIds", () => {
  it("collects each referenced file once, skipping images with no file yet", () => {
    const elements = [
      newImage({ x: 0, y: 0, fileId: "a" }),
      newRectangle({ x: 0, y: 0 }),
      newImage({ x: 0, y: 0, fileId: "b" }),
      newImage({ x: 0, y: 0, fileId: "a" }),
      newImage({ x: 0, y: 0 }),
    ]
    expect([...imageFileIds(elements)]).toEqual(["a", "b"])
  })

  it("includes deleted elements: callers decide what to pass", () => {
    expect([
      ...imageFileIds([{ ...newImage({ x: 0, y: 0, fileId: "a" }), isDeleted: true }]),
    ]).toEqual(["a"])
  })
})
