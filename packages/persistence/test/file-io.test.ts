import { Scene, newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { parseExcalidrawFile, serializeDocument, toExcalidrawBlob } from "../src/file-io"

describe("serializeDocument", () => {
  it("returns ExcalidrawData v3 with one page per DocumentPage entry", () => {
    const scene = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    const data = serializeDocument([{ id: "p1", name: "Page 1", scene }], "p1")
    expect(data.type).toBe("excalidraw")
    expect(data.version).toBe(3)
    expect(data.activePageId).toBe("p1")
    expect(data.pages).toEqual([
      { id: "p1", name: "Page 1", elements: scene.getElementsIncludingDeleted() },
    ])
  })

  it("includes appState and files when provided", () => {
    const scene = new Scene()
    const data = serializeDocument(
      [{ id: "p1", name: "Page 1", scene }],
      "p1",
      { theme: "dark" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "x", created: 0 } },
    )
    expect(data.appState).toEqual({ theme: "dark" })
    expect(data.files?.f1?.id).toBe("f1")
  })

  it("serializes multiple pages in order", () => {
    const s1 = new Scene([newRectangle({ x: 0, y: 0, width: 10, height: 10 })])
    const s2 = new Scene()
    const data = serializeDocument(
      [
        { id: "p1", name: "Page 1", scene: s1 },
        { id: "p2", name: "Page 2", scene: s2 },
      ],
      "p2",
    )
    expect(data.pages.map((p) => p.id)).toEqual(["p1", "p2"])
    expect(data.activePageId).toBe("p2")
  })
})

describe("toExcalidrawBlob", () => {
  it("returns a Blob with type application/json", () => {
    const blob = toExcalidrawBlob({
      type: "excalidraw",
      version: 3,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    })
    expect(blob.type).toBe("application/json")
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe("parseExcalidrawFile", () => {
  it("parses a v3 file directly", async () => {
    const data = {
      type: "excalidraw",
      version: 3,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    }
    const file = new File([JSON.stringify(data)], "test.excalidraw", {
      type: "application/json",
    })
    const out = await parseExcalidrawFile(file)
    expect(out).toEqual(data)
  })

  it("migrates a v1 file on open, all the way to v3", async () => {
    const data = { type: "excalidraw", version: 1, source: "x", elements: [] }
    const file = new File([JSON.stringify(data)], "old.excalidraw", {
      type: "application/json",
    })
    const out = await parseExcalidrawFile(file)
    expect(out.version).toBe(3)
    expect(out.pages.length).toBe(1)
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
