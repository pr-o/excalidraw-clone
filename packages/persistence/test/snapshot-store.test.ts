import { buildExcalidrawData, type ExcalidrawData } from "@excalidraw-clone/scene"
import { openDB } from "idb"
import { describe, expect, it } from "vitest"
import { _resetDBForTesting, DB_NAME } from "../src/db"
import { getLibraryItem } from "../src/library-store"
import {
  deleteSnapshot,
  listSnapshots,
  loadSnapshot,
  MAX_SNAPSHOTS,
  saveSnapshot,
} from "../src/snapshot-store"

function doc(rectCount: number): ExcalidrawData {
  const elements = Array.from({ length: rectCount }, (_, i) => ({
    id: `r${i}`,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  })) as never[]
  return buildExcalidrawData(
    [
      { id: "p1", name: "Page 1", elements },
      { id: "p2", name: "Page 2", elements: [] },
    ],
    "p1",
  )
}

describe("snapshot-store", () => {
  it("save then load round-trips the whole multi-page document", async () => {
    const saved = await saveSnapshot("First", doc(2))
    expect(saved.name).toBe("First")
    const loaded = await loadSnapshot(saved.id)
    expect(loaded?.pages.map((p) => p.name)).toEqual(["Page 1", "Page 2"])
    expect(loaded?.pages[0]?.elements).toHaveLength(2)
    expect(loaded?.activePageId).toBe("p1")
  })

  it("loadSnapshot returns null for a missing id", async () => {
    expect(await loadSnapshot("nope")).toBeNull()
  })

  it("listSnapshots is newest-first and omits the document", async () => {
    await saveSnapshot("a", doc(1))
    await saveSnapshot("b", doc(1))
    await saveSnapshot("c", doc(1))
    const list = await listSnapshots()
    expect(list.map((s) => s.name)).toEqual(["c", "b", "a"])
    expect(list[0]).not.toHaveProperty("document")
    expect(typeof list[0]?.createdAt).toBe("number")
  })

  it("deleteSnapshot removes one snapshot", async () => {
    const a = await saveSnapshot("a", doc(1))
    await saveSnapshot("b", doc(1))
    await deleteSnapshot(a.id)
    expect((await listSnapshots()).map((s) => s.name)).toEqual(["b"])
    expect(await loadSnapshot(a.id)).toBeNull()
  })

  it(`caps at ${MAX_SNAPSHOTS}, evicting the oldest on save`, async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 2; i++) await saveSnapshot(`s${i}`, doc(0))
    const list = await listSnapshots()
    expect(list).toHaveLength(MAX_SNAPSHOTS)
    expect(list[0]?.name).toBe(`s${MAX_SNAPSHOTS + 1}`)
    expect(list.at(-1)?.name).toBe("s2")
  })

  it("upgrades a v2 database without losing existing data", async () => {
    const old = await openDB(DB_NAME, 2, {
      upgrade(db) {
        db.createObjectStore("files", { keyPath: "id" })
        db.createObjectStore("library_items", { keyPath: "id" })
      },
    })
    await old.put("library_items", { id: "lib1", name: "L", created: 1, elements: [] })
    old.close()
    await _resetDBForTesting()

    expect((await getLibraryItem("lib1"))?.name).toBe("L")
    const s = await saveSnapshot("after upgrade", doc(1))
    expect((await listSnapshots()).map((x) => x.id)).toEqual([s.id])
  })
})
