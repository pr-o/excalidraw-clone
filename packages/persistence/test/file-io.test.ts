import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { parseExcalidrawFile, serializeScene, toExcalidrawBlob } from "../src/file-io"

describe("serializeScene", () => {
  it("returns ExcalidrawData with version 2 and the scene's elements", () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    const data = serializeScene(scene)
    expect(data.type).toBe("excalidraw")
    expect(data.version).toBe(2)
    expect(data.elements.length).toBe(1)
  })

  it("includes appState and files when provided", () => {
    const scene = new Scene()
    const data = serializeScene(
      scene,
      { theme: "dark" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "x", created: 0 } },
    )
    expect(data.appState).toEqual({ theme: "dark" })
    expect(data.files?.f1?.id).toBe("f1")
  })
})

describe("toExcalidrawBlob", () => {
  it("returns a Blob with type application/json", () => {
    const blob = toExcalidrawBlob({
      type: "excalidraw",
      version: 2,
      source: "x",
      elements: [],
    })
    expect(blob.type).toBe("application/json")
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe("parseExcalidrawFile", () => {
  it("parses a v2 file directly", async () => {
    const data = {
      type: "excalidraw",
      version: 2,
      source: "x",
      elements: [],
    }
    const file = new File([JSON.stringify(data)], "test.excalidraw", {
      type: "application/json",
    })
    const out = await parseExcalidrawFile(file)
    expect(out).toEqual(data)
  })

  it("migrates a v1 file on open", async () => {
    const data = { type: "excalidraw", version: 1, source: "x", elements: [] }
    const file = new File([JSON.stringify(data)], "old.excalidraw", {
      type: "application/json",
    })
    const out = await parseExcalidrawFile(file)
    expect(out.version).toBe(2)
  })

  it("rejects malformed JSON", async () => {
    const file = new File(["{not-json"], "bad.excalidraw", { type: "application/json" })
    await expect(parseExcalidrawFile(file)).rejects.toThrow(/parse/i)
  })

  it("rejects non-excalidraw shape", async () => {
    const file = new File([JSON.stringify({ foo: "bar" })], "bad.excalidraw", {
      type: "application/json",
    })
    await expect(parseExcalidrawFile(file)).rejects.toThrow(/unrecognized/i)
  })
})
