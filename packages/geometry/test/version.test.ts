import { describe, expect, it } from "vitest"
import { PACKAGE_NAME, PACKAGE_VERSION } from "../src"

describe("geometry package smoke", () => {
  it("exports the expected package name", () => {
    expect(PACKAGE_NAME).toBe("@excalidraw-clone/geometry")
  })

  it("exports the initial version", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0")
  })
})
