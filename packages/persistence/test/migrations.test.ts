import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { migrate } from "../src/migrations"

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = async (name: string): Promise<unknown> => {
  const text = await readFile(join(HERE, "fixtures", name), "utf8")
  return JSON.parse(text) as unknown
}

describe("migrate", () => {
  it("v1 input migrates all the way to v3 (through v2's boundElements fix)", async () => {
    const v1 = await fixture("v1-rect.json")
    const v2Expected = (await fixture("v2-rect.json")) as { elements: unknown[] }
    const result = migrate(v1)
    expect(result.version).toBe(3)
    expect(result.pages.length).toBe(1)
    expect(result.pages[0]?.elements).toEqual(v2Expected.elements)
    expect(result.activePageId).toBe(result.pages[0]?.id)
  })

  it("v2 input wraps its flat elements into a single named page", async () => {
    const v2 = (await fixture("v2-rect.json")) as { elements: unknown[] }
    const result = migrate(v2)
    expect(result.version).toBe(3)
    expect(result.pages).toEqual([
      { id: result.activePageId, name: "Page 1", elements: v2.elements },
    ])
  })

  it("v3 input is returned unchanged (already current)", () => {
    const v3 = {
      type: "excalidraw" as const,
      version: 3 as const,
      source: "x",
      pages: [{ id: "p1", name: "Page 1", elements: [] }],
      activePageId: "p1",
    }
    expect(migrate(v3)).toEqual(v3)
  })

  it("throws on unknown payload shape", () => {
    expect(() => migrate({ foo: "bar" })).toThrow(/unrecognized/i)
  })

  it("throws on version newer than current", () => {
    expect(() =>
      migrate({ type: "excalidraw", version: 99, source: "x", pages: [], activePageId: "x" }),
    ).toThrow(/newer/i)
  })
})

describe("migrate — image crop normalisation", () => {
  const load = (crop: unknown, hasKey = true) => {
    const image: Record<string, unknown> = { id: "i", type: "image", fileId: "f" }
    if (hasKey) image.crop = crop
    const data = {
      type: "excalidraw",
      version: 3,
      source: "t",
      activePageId: "p",
      pages: [{ id: "p", name: "Page 1", elements: [image] }],
    }
    return (migrate(data).pages[0]!.elements[0] as unknown as { crop: unknown }).crop
  }

  it("converts upstream pixel crop (with natural size) to fractions", () => {
    const crop = { x: 20, y: 10, width: 60, height: 40, naturalWidth: 200, naturalHeight: 100 }
    expect(load(crop)).toEqual({ x: 0.1, y: 0.1, width: 0.3, height: 0.4 })
  })

  it("converts a crop saved by upstream excalidraw.com (real file values)", () => {
    const c = load({
      x: 18.640776699028816,
      y: 10.252430739911931,
      width: 160.54365139563112,
      height: 171.4174674321149,
      naturalWidth: 200,
      naturalHeight: 200,
    }) as { x: number; y: number; width: number; height: number }
    expect(c.x).toBeCloseTo(0.0932, 4)
    expect(c.y).toBeCloseTo(0.0513, 4)
    expect(c.width).toBeCloseTo(0.8027, 4)
    expect(c.height).toBeCloseTo(0.8571, 4)
  })

  it("clamps a pixel crop that overshoots the natural size", () => {
    const crop = { x: 150, y: 0, width: 100, height: 100, naturalWidth: 200, naturalHeight: 100 }
    expect(load(crop)).toEqual({ x: 0.75, y: 0, width: 0.25, height: 1 })
  })

  it("drops a degenerate pixel crop", () => {
    expect(
      load({ x: 0, y: 0, width: 0, height: 5, naturalWidth: 10, naturalHeight: 10 }),
    ).toBeNull()
    expect(load({ x: 0, y: 0, width: 5, height: 5, naturalWidth: 0, naturalHeight: 10 })).toBeNull()
  })

  it("fills a missing crop key with null", () => {
    expect(load(undefined, false)).toBeNull()
  })

  it("leaves our own fractional crop untouched", () => {
    const crop = { x: 0.2, y: 0, width: 0.8, height: 1 }
    expect(load(crop)).toEqual(crop)
  })
})

describe("migrate — text spans validation", () => {
  const load = (el: Record<string, unknown>) => {
    const data = {
      type: "excalidraw",
      version: 3,
      source: "t",
      activePageId: "p",
      pages: [{ id: "p", name: "Page 1", elements: [{ id: "t", type: "text", ...el }] }],
    }
    return migrate(data).pages[0]!.elements[0] as unknown as { spans?: unknown }
  }

  it("round-trips valid spans", () => {
    expect(load({ text: "hello world", spans: [{ start: 6, end: 11, bold: true }] }).spans).toEqual(
      [{ start: 6, end: 11, bold: true }],
    )
  })
  it("loads old documents without spans", () => {
    expect("spans" in load({ text: "hi" })).toBe(false)
  })
  it("drops malformed spans and normalizes the rest", () => {
    expect("spans" in load({ text: "hi", spans: "bold" })).toBe(false)
    expect("spans" in load({ text: "hi", spans: [null, { start: -1, end: 2, bold: true }] })).toBe(
      false,
    )
    expect(
      load({
        text: "hello",
        spans: [
          { start: 3, end: 99, italic: true },
          { start: 2, end: 1 },
        ],
      }).spans,
    ).toEqual([{ start: 3, end: 5, italic: true }])
  })
})

describe("migrate — table validation", () => {
  const load = (el: Record<string, unknown>) => {
    const data = {
      type: "excalidraw",
      version: 3,
      source: "t",
      activePageId: "p",
      pages: [{ id: "p", name: "Page 1", elements: [{ id: "t", type: "table", ...el }] }],
    }
    return migrate(data).pages[0]!.elements[0] as unknown as Record<string, unknown>
  }

  it("round-trips a valid table unchanged", () => {
    const valid = {
      rows: 2,
      cols: 2,
      colWidths: [100, 150],
      rowHeights: [40, 60],
      cells: [
        ["a", "b"],
        ["c", "한글"],
      ],
      headerRow: false,
      fontSize: 20,
      fontFamily: 2,
      textAlign: "center",
      width: 250,
      height: 100,
    }
    expect(load(valid)).toMatchObject(valid)
  })

  it("clamps, pads and coerces a malformed table", () => {
    const t = load({ rows: 500, cols: -3, colWidths: "x", cells: [[1, null]], headerRow: "yes" })
    expect(t.rows).toBe(50)
    expect(t.cols).toBe(1)
    expect(t.colWidths).toEqual([120])
    expect((t.rowHeights as number[]).length).toBe(50)
    expect((t.cells as string[][])[0]).toEqual(["1"])
    expect((t.cells as string[][]).length).toBe(50)
    expect(t.headerRow).toBe(true)
  })

  it("replaces a table with no usable fields by a default 3x3", () => {
    const t = load({})
    expect([t.rows, t.cols, t.width, t.height]).toEqual([3, 3, 360, 120])
  })

  it("old documents without any table load unchanged", () => {
    const data = {
      type: "excalidraw",
      version: 3,
      source: "t",
      activePageId: "p",
      pages: [{ id: "p", name: "P", elements: [{ id: "r", type: "rectangle", x: 1 }] }],
    }
    expect(migrate(data).pages[0]!.elements).toEqual([{ id: "r", type: "rectangle", x: 1 }])
  })
})
