import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("persistence package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/persistence")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on scene only", () => {
    expect(DEPENDS_ON).toEqual(["@excalidraw-clone/scene"])
  })
})
