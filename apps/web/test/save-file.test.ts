import { newRectangle, Scene, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { referencedFileIds } from "../src/driver/saveFile"

const image = (fileId: string | null, isDeleted = false): ExcalidrawElement =>
  ({
    ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
    type: "image",
    fileId,
    isDeleted,
    crop: null,
  }) as unknown as ExcalidrawElement

describe("referencedFileIds", () => {
  it("collects image file ids across pages, including deleted elements", () => {
    const pages = [
      { scene: new Scene([image("a"), newRectangle({ x: 0, y: 0, width: 1, height: 1 })]) },
      { scene: new Scene([image("b", true), image(null)]) },
    ]
    expect([...referencedFileIds(pages)].sort()).toEqual(["a", "b"])
  })

  it("is empty for a document without images", () => {
    expect(referencedFileIds([{ scene: new Scene() }]).size).toBe(0)
  })
})
