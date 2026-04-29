import { describe, expect, it } from "vitest"
import { PACKAGE_NAME as GEOMETRY } from "@excalidraw-clone/geometry"
import { PACKAGE_NAME as SCENE } from "@excalidraw-clone/scene"
import { PACKAGE_NAME as RENDERER } from "@excalidraw-clone/renderer"
import { PACKAGE_NAME as TOOLS } from "@excalidraw-clone/tools"
import { PACKAGE_NAME as UI } from "@excalidraw-clone/ui"
import { PACKAGE_NAME as PERSISTENCE } from "@excalidraw-clone/persistence"

describe("apps/web wiring smoke", () => {
  it("imports all six packages by name", () => {
    expect([GEOMETRY, SCENE, RENDERER, TOOLS, UI, PERSISTENCE]).toEqual([
      "@excalidraw-clone/geometry",
      "@excalidraw-clone/scene",
      "@excalidraw-clone/renderer",
      "@excalidraw-clone/tools",
      "@excalidraw-clone/ui",
      "@excalidraw-clone/persistence",
    ])
  })
})
