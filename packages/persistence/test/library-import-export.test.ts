import type { ExcalidrawBinaryFile, LibraryItem } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { getAllFiles, putFile } from "../src/image-store"
import {
  exportLibraryFile,
  getAllLibraryItems,
  importLibraryFile,
  putLibraryItem,
} from "../src/library-store"

function item(id: string, fileIds: string[] = []): LibraryItem {
  return {
    id,
    name: `Item ${id}`,
    created: Number(id) || 100,
    elements: fileIds.map(
      (fid, i) =>
        ({
          id: `el-${id}-${i}`,
          type: "image",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fileId: fid,
        }) as never,
    ),
  }
}

const binA: ExcalidrawBinaryFile = {
  id: "binA",
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAAA",
  created: 1,
}

interface ParsedLib {
  type: string
  version: number
  source: string
  libraryItems: LibraryItem[]
  files: Record<string, ExcalidrawBinaryFile>
}

async function readLib(blob: Blob): Promise<ParsedLib> {
  return JSON.parse(await blob.text()) as ParsedLib
}

describe("exportLibraryFile", () => {
  it("emits an .excalidrawlib v2 blob with empty libraryItems for an empty store", async () => {
    const json = await readLib(await exportLibraryFile())
    expect(json.type).toBe("excalidrawlib")
    expect(json.version).toBe(2)
    expect(json.source).toBe("excalidraw-clone")
    expect(json.libraryItems).toEqual([])
    expect(json.files).toEqual({})
  })

  it("includes all stored items and unions their files", async () => {
    await putFile(binA)
    await putLibraryItem({ ...item("100", ["binA"]), files: { binA } })
    await putLibraryItem(item("200"))
    const json = await readLib(await exportLibraryFile())
    expect(json.libraryItems.map((i) => i.id).sort()).toEqual(["100", "200"])
    expect(json.files.binA).toEqual(binA)
  })
})

describe("importLibraryFile", () => {
  it("adds well-formed items and reports counts", async () => {
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "excalidraw-clone",
      libraryItems: [item("100"), item("200")],
      files: {},
    }
    const blob = new Blob([JSON.stringify(file)], { type: "application/json" })
    const result = await importLibraryFile(blob)
    expect(result).toEqual({ added: 2, skipped: 0 })
    expect((await getAllLibraryItems()).length).toBe(2)
  })

  it("skips items whose ids already exist locally", async () => {
    await putLibraryItem(item("100"))
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "x",
      libraryItems: [item("100"), item("200")],
      files: {},
    }
    const blob = new Blob([JSON.stringify(file)])
    const result = await importLibraryFile(blob)
    expect(result).toEqual({ added: 1, skipped: 1 })
  })

  it("writes top-level files map into the canonical files store", async () => {
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "x",
      libraryItems: [item("100", ["binA"])],
      files: { binA },
    }
    const blob = new Blob([JSON.stringify(file)])
    await importLibraryFile(blob)
    const all = await getAllFiles()
    expect(all.some((f) => f.id === "binA")).toBe(true)
  })

  it("attaches the referenced subset of files to each imported item row", async () => {
    const file = {
      type: "excalidrawlib",
      version: 2,
      source: "x",
      libraryItems: [item("100", ["binA"])],
      files: { binA },
    }
    await importLibraryFile(new Blob([JSON.stringify(file)]))
    const items = await getAllLibraryItems()
    expect(items[0]!.files?.binA).toEqual(binA)
  })

  it("rejects malformed JSON without partial writes", async () => {
    const blob = new Blob(["not json at all"])
    await expect(importLibraryFile(blob)).rejects.toThrow(/parse|JSON/i)
    expect((await getAllLibraryItems()).length).toBe(0)
  })

  it("rejects wrong type or version without partial writes", async () => {
    const blob = new Blob([JSON.stringify({ type: "excalidraw", version: 2, libraryItems: [] })])
    await expect(importLibraryFile(blob)).rejects.toThrow(/excalidrawlib|format|version/i)
    expect((await getAllLibraryItems()).length).toBe(0)
  })

  it("round-trips: export then re-import yields no-op (all skipped)", async () => {
    await putLibraryItem(item("100"))
    await putLibraryItem(item("200"))
    const blob = await exportLibraryFile()
    const result = await importLibraryFile(blob)
    expect(result).toEqual({ added: 0, skipped: 2 })
  })
})
