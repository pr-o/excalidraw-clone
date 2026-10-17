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

  it("round-trips an element's optional gradient field", async () => {
    const rect = {
      ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
      gradient: { to: "#a5d8ff", angle: 135 },
    }
    const blob = toExcalidrawBlob(
      serializeDocument([{ id: "p1", name: "P", scene: new Scene([rect]) }], "p1"),
    )
    const out = await parseExcalidrawFile(new File([await blob.text()], "g.excalidraw"))
    expect(out.pages[0]?.elements[0]?.gradient).toEqual({ to: "#a5d8ff", angle: 135 })
  })
})

describe("user guides persistence", () => {
  it("round-trips page guides through serialize → JSON → migrate", async () => {
    const scene = new Scene([], { x: [100, 250], y: [40] })
    const data = serializeDocument([{ id: "p1", name: "Page 1", scene }], "p1")
    const file = new File([JSON.stringify(data)], "d.excalidraw")
    const loaded = await parseExcalidrawFile(file)
    expect(loaded.pages[0]!.guides).toEqual({ x: [100, 250], y: [40] })
  })

  it("omits guides for a page without any", () => {
    const data = serializeDocument([{ id: "p1", name: "Page 1", scene: new Scene() }], "p1")
    expect("guides" in data.pages[0]!).toBe(false)
  })

  it("loads an older v3 document that has no guides field", async () => {
    const old = {
      type: "excalidraw",
      version: 3,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    }
    const loaded = await parseExcalidrawFile(new File([JSON.stringify(old)], "o.excalidraw"))
    expect(loaded.pages[0]!.guides).toBeUndefined()
    expect(loaded.pages[0]!.elements).toEqual([])
  })
})

describe("user guides validation on load", () => {
  it("drops non-numeric guide entries and malformed guides", async () => {
    const doc = {
      type: "excalidraw",
      version: 3,
      source: "x",
      pages: [
        { id: "p1", name: "A", elements: [], guides: { x: [1, "2", null, 3], y: "bad" } },
        { id: "p2", name: "B", elements: [], guides: "junk" },
      ],
      activePageId: "p1",
    }
    const loaded = await parseExcalidrawFile(new File([JSON.stringify(doc)], "g.excalidraw"))
    expect(loaded.pages[0]!.guides).toEqual({ x: [1, 3], y: [] })
    expect(loaded.pages[1]!.guides).toBeUndefined()
  })
})
