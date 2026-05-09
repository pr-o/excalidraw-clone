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
  it("v1 → v2 adds boundElements to shape elements", async () => {
    const v1 = await fixture("v1-rect.json")
    const expected = await fixture("v2-rect.json")
    expect(migrate(v1)).toEqual(expected)
  })

  it("v2 input is returned unchanged (already current)", async () => {
    const v2 = await fixture("v2-rect.json")
    expect(migrate(v2)).toEqual(v2)
  })

  it("throws on unknown payload shape", () => {
    expect(() => migrate({ foo: "bar" })).toThrow(/unrecognized/i)
  })

  it("throws on version newer than current", () => {
    expect(() => migrate({ type: "excalidraw", version: 99, source: "x", elements: [] })).toThrow(
      /newer/i,
    )
  })
})
