import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("scene package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/scene")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on @excalidraw-clone/geometry", () => {
    expect(DEPENDS_ON).toContain("@excalidraw-clone/geometry")
  })
})
