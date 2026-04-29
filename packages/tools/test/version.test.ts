import { describe, expect, it } from "vitest"
import { DEPENDS_ON, PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("tools package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/tools")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })

  it("depends on geometry and scene", () => {
    expect(DEPENDS_ON).toEqual(["@excalidraw-clone/geometry", "@excalidraw-clone/scene"])
  })
})
