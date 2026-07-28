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
