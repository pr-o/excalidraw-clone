import type { ExcalidrawElement } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { imageTool, type ImageEvent } from "../src/tools/image"
import { applyMutation, makeCtx, point } from "./test-utils"

describe("imageTool", () => {
  it("starts idle", () => {
    expect(imageTool.initial.phase).toBe("idle")
  })

  it("imageReady transitions idle → placing", () => {
    const ctx = makeCtx()
    const ready: ImageEvent = {
      type: "imageReady",
      fileId: "abc",
      mimeType: "image/png",
      width: 200,
      height: 100,
      at: point(0, 0),
    }
    const [next] = imageTool.reduce(imageTool.initial, ready, ctx)
    expect(next.phase).toBe("placing")
  })

  it("pointerDown in placing emits a mutation that adds an image element", () => {
    const ctx = makeCtx()
    const draft: ExcalidrawElement[] = []
    const [, effects] = imageTool.reduce(
      { phase: "placing", fileId: "abc", mimeType: "image/png", aspect: 2 },
      { type: "pointerDown", at: point(50, 50) },
      ctx,
    )
    applyMutation(effects, draft)
    expect(draft.length).toBe(1)
    expect(draft[0]?.type).toBe("image")
    if (draft[0]?.type === "image") {
      expect(draft[0].fileId).toBe("abc")
      expect(draft[0].x).toBe(50)
      expect(draft[0].y).toBe(50)
      expect(draft[0].width).toBe(200)
      expect(draft[0].height).toBe(100)
    }
    const switchTo = effects.find((e) => e.kind === "switchTool")
    expect(switchTo).toBeDefined()
    if (switchTo?.kind === "switchTool") expect(switchTo.tool).toBe("selection")
  })

  it("escape in placing returns to idle", () => {
    const ctx = makeCtx()
    const [next] = imageTool.reduce(
      { phase: "placing", fileId: "abc", mimeType: "image/png", aspect: 1 },
      { type: "escape" },
      ctx,
    )
    expect(next.phase).toBe("idle")
  })
})
