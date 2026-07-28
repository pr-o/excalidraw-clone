import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { createPageRecord, DEFAULT_VIEWPORT, pagesFromDocument } from "../src/driver/pages"

describe("createPageRecord", () => {
  it("creates a page record with a fresh Scene, a generated id, and the given name", () => {
    const record = createPageRecord("Page 1")
    expect(record.name).toBe("Page 1")
    expect(typeof record.id).toBe("string")
    expect(record.scene.getElements()).toEqual([])
    expect(record.viewport).toEqual(DEFAULT_VIEWPORT)
  })

  it("seeds the Scene with the given elements", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const record = createPageRecord("Page 1", [r])
    expect(record.scene.getElements()).toEqual([r])
  })
})

describe("pagesFromDocument", () => {
  it("builds one PageRecord per page in the document, preserving order and activePageId", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const data = {
      type: "excalidraw" as const,
      version: 3 as const,
      source: "x",
      pages: [
        { id: "p1", name: "Page 1", elements: [r] },
        { id: "p2", name: "Page 2", elements: [] },
      ],
      activePageId: "p2",
    }
    const { pages, activePageId } = pagesFromDocument(data)
    expect(pages.map((p) => p.id)).toEqual(["p1", "p2"])
    expect(pages[0]?.name).toBe("Page 1")
    expect(pages[0]?.scene.getElements()).toEqual([r])
    expect(activePageId).toBe("p2")
  })
})
