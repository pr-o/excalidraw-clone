import { newRectangle } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  addPage,
  createPageRecord,
  cyclePageId,
  DEFAULT_VIEWPORT,
  deletePage,
  duplicatePage,
  movePage,
  pagesFromDocument,
  renamePage,
  reorderPage,
  withViewport,
} from "../src/driver/pages"

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

describe("addPage", () => {
  it("appends a new page named 'Page N' where N is the next count", () => {
    const a = createPageRecord("Page 1")
    const result = addPage([a])
    expect(result.length).toBe(2)
    expect(result[1]?.name).toBe("Page 2")
    expect(result[0]).toBe(a)
  })
})

describe("deletePage", () => {
  it("removes the page with the given id", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = deletePage([a, b], a.id)
    expect(result).toEqual([b])
  })

  it("refuses to delete the last remaining page", () => {
    const a = createPageRecord("Page 1")
    const result = deletePage([a], a.id)
    expect(result).toEqual([a])
  })
})

describe("renamePage", () => {
  it("renames only the matching page", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = renamePage([a, b], a.id, "Notes")
    expect(result[0]?.name).toBe("Notes")
    expect(result[1]?.name).toBe("Page 2")
  })
})

describe("duplicatePage", () => {
  it("inserts a clone with fresh ids right after the source page", () => {
    const r = newRectangle({ x: 0, y: 0, width: 10, height: 10 })
    const a = createPageRecord("Page 1", [r])
    const b = createPageRecord("Page 2")
    const result = duplicatePage([a, b], a.id)
    expect(result.length).toBe(3)
    expect(result[1]?.name).toBe("Page 1 copy")
    expect(result[1]?.id).not.toBe(a.id)
    expect(result[1]?.scene.getElements()[0]?.id).not.toBe(r.id)
    expect(result[1]?.scene.getElements()[0]?.type).toBe("rectangle")
    expect(result[2]).toBe(b)
  })
})

describe("reorderPage", () => {
  it("swaps with the previous page when direction is 'left'", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = reorderPage([a, b], b.id, "left")
    expect(result).toEqual([b, a])
  })

  it("swaps with the next page when direction is 'right'", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = reorderPage([a, b], a.id, "right")
    expect(result).toEqual([b, a])
  })

  it("is a no-op past either edge", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    expect(reorderPage([a, b], a.id, "left")).toEqual([a, b])
    expect(reorderPage([a, b], b.id, "right")).toEqual([a, b])
  })
})

describe("withViewport", () => {
  it("updates only the matching page's viewport", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const viewport = { scrollX: 10, scrollY: 20, zoom: 2 }
    const result = withViewport([a, b], a.id, viewport)
    expect(result[0]?.viewport).toEqual(viewport)
    expect(result[1]?.viewport).toEqual(DEFAULT_VIEWPORT)
  })
})

describe("cyclePageId", () => {
  it("returns the next page's id, wrapping past the end", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    expect(cyclePageId([a, b], a.id, "next")).toBe(b.id)
    expect(cyclePageId([a, b], b.id, "next")).toBe(a.id)
  })

  it("returns the previous page's id, wrapping before the start", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    expect(cyclePageId([a, b], a.id, "prev")).toBe(b.id)
    expect(cyclePageId([a, b], b.id, "prev")).toBe(a.id)
  })
})

describe("movePage", () => {
  it("moves a page from its current index to an arbitrary target index", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const c = createPageRecord("Page 3")
    const result = movePage([a, b, c], c.id, 0)
    expect(result.map((p) => p.id)).toEqual([c.id, a.id, b.id])
  })

  it("clamps a too-large target index to the last position", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], a.id, 99)
    expect(result.map((p) => p.id)).toEqual([b.id, a.id])
  })

  it("clamps a negative target index to the first position", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], b.id, -5)
    expect(result.map((p) => p.id)).toEqual([b.id, a.id])
  })

  it("is a no-op when the id is not found", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], "missing", 0)
    expect(result).toEqual([a, b])
  })

  it("is effectively a no-op when toIndex equals the current index", () => {
    const a = createPageRecord("Page 1")
    const b = createPageRecord("Page 2")
    const result = movePage([a, b], a.id, 0)
    expect(result.map((p) => p.id)).toEqual([a.id, b.id])
  })
})
