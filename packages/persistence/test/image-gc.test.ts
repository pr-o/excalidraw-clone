import {
  newRectangle,
  type ExcalidrawBinaryFile,
  type ExcalidrawElement,
  type LibraryItem,
} from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import { collectUnreferencedFiles } from "../src/image-gc"
import { getAllFiles, putFile } from "../src/image-store"
import { putLibraryItem } from "../src/library-store"
import { saveSnapshot } from "../src/snapshot-store"

const NOW = 10 * 60 * 60 * 1000
const OLD = 1

const file = (id: string, created = OLD): ExcalidrawBinaryFile => ({
  id,
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAAA",
  created,
})

const image = (fileId: string, isDeleted = false): ExcalidrawElement =>
  ({
    ...newRectangle({ x: 0, y: 0, width: 10, height: 10 }),
    type: "image",
    fileId,
    isDeleted,
    crop: null,
  }) as unknown as ExcalidrawElement

const ids = async (): Promise<string[]> => (await getAllFiles()).map((f) => f.id).sort()

describe("collectUnreferencedFiles", () => {
  it("removes old files nothing references and keeps the open document's, deleted elements included", async () => {
    for (const id of ["used", "undo-only", "orphan"]) await putFile(file(id))
    const removed = await collectUnreferencedFiles([[image("used"), image("undo-only", true)]], {
      now: NOW,
    })
    expect(removed).toBe(1)
    expect(await ids()).toEqual(["undo-only", "used"])
  })

  it("keeps files used by a snapshot or a library item", async () => {
    for (const id of ["in-snapshot", "in-library", "in-library-files", "orphan"]) {
      await putFile(file(id))
    }
    await saveSnapshot("s", {
      type: "excalidraw",
      version: 3,
      source: "t",
      activePageId: "p",
      pages: [{ id: "p", name: "P", elements: [image("in-snapshot")] }],
    })
    const item: LibraryItem = {
      id: "lib",
      name: "L",
      created: 1,
      elements: [image("in-library")],
      files: { "in-library-files": file("in-library-files") },
    }
    await putLibraryItem(item)
    expect(await collectUnreferencedFiles([[]], { now: NOW })).toBe(1)
    expect(await ids()).toEqual(["in-library", "in-library-files", "in-snapshot"])
  })

  it("never touches files younger than the minimum age", async () => {
    await putFile(file("fresh", NOW - 1000))
    expect(await collectUnreferencedFiles([[]], { now: NOW })).toBe(0)
    expect(await ids()).toEqual(["fresh"])
  })

  it("does nothing when a snapshot cannot be read", async () => {
    await putFile(file("orphan"))
    await saveSnapshot("broken", { not: "a document" } as never)
    expect(await collectUnreferencedFiles([[]], { now: NOW })).toBe(0)
    expect(await ids()).toEqual(["orphan"])
  })
})
