import type { LibraryItem } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  clearLibrary,
  deleteLibraryItem,
  getAllLibraryItems,
  getLibraryItem,
  putLibraryItem,
  renameLibraryItem,
} from "../src/library-store"

function item(id: string, name: string, created: number): LibraryItem {
  return {
    id,
    name,
    created,
    elements: [{ id: `${id}-el`, type: "rectangle", x: 0, y: 0, width: 10, height: 10 } as never],
  }
}

describe("library-store CRUD", () => {
  it("getLibraryItem returns undefined when missing", async () => {
    expect(await getLibraryItem("nope")).toBeUndefined()
  })

  it("putLibraryItem then getLibraryItem round-trips", async () => {
    const a = item("a", "A", 100)
    await putLibraryItem(a)
    expect(await getLibraryItem("a")).toEqual(a)
  })

  it("getAllLibraryItems returns newest-first by created", async () => {
    await putLibraryItem(item("a", "A", 100))
    await putLibraryItem(item("b", "B", 300))
    await putLibraryItem(item("c", "C", 200))
    const all = await getAllLibraryItems()
    expect(all.map((i) => i.id)).toEqual(["b", "c", "a"])
  })

  it("deleteLibraryItem removes a single record", async () => {
    await putLibraryItem(item("a", "A", 100))
    await putLibraryItem(item("b", "B", 200))
    await deleteLibraryItem("a")
    expect(await getLibraryItem("a")).toBeUndefined()
    expect(await getLibraryItem("b")).toBeDefined()
  })

  it("renameLibraryItem mutates only the name field", async () => {
    const a = item("a", "Old", 100)
    await putLibraryItem(a)
    await renameLibraryItem("a", "New")
    const got = await getLibraryItem("a")
    expect(got?.name).toBe("New")
    expect(got?.created).toBe(100)
    expect(got?.elements).toEqual(a.elements)
  })

  it("renameLibraryItem on a missing id is a no-op (does not throw)", async () => {
    await expect(renameLibraryItem("nope", "X")).resolves.toBeUndefined()
  })

  it("clearLibrary wipes the store", async () => {
    await putLibraryItem(item("a", "A", 100))
    await putLibraryItem(item("b", "B", 200))
    await clearLibrary()
    expect(await getAllLibraryItems()).toEqual([])
  })
})
