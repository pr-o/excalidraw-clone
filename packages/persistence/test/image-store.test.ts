import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { describe, expect, it } from "vitest"
import {
  addImageFromBlob,
  clearAllFiles,
  deleteFile,
  getAllFiles,
  getFile,
  putFile,
} from "../src/image-store"

const fileA: ExcalidrawBinaryFile = {
  id: "a",
  mimeType: "image/png",
  dataURL: "data:image/png;base64,AAAA",
  created: 1,
}

const fileB: ExcalidrawBinaryFile = {
  id: "b",
  mimeType: "image/jpeg",
  dataURL: "data:image/jpeg;base64,BBBB",
  created: 2,
}

describe("image-store", () => {
  it("getFile returns undefined when missing", async () => {
    expect(await getFile("nope")).toBeUndefined()
  })

  it("putFile then getFile round-trips", async () => {
    await putFile(fileA)
    expect(await getFile("a")).toEqual(fileA)
  })

  it("putFile is idempotent on same id (last write wins)", async () => {
    await putFile(fileA)
    await putFile({ ...fileA, dataURL: "data:image/png;base64,ZZZZ" })
    const got = await getFile("a")
    expect(got?.dataURL).toBe("data:image/png;base64,ZZZZ")
  })

  it("getAllFiles returns every file in store", async () => {
    await putFile(fileA)
    await putFile(fileB)
    const all = await getAllFiles()
    const ids = all.map((f) => f.id).sort()
    expect(ids).toEqual(["a", "b"])
  })

  it("deleteFile removes a single record", async () => {
    await putFile(fileA)
    await putFile(fileB)
    await deleteFile("a")
    expect(await getFile("a")).toBeUndefined()
    expect(await getFile("b")).toEqual(fileB)
  })

  it("clearAllFiles wipes the store", async () => {
    await putFile(fileA)
    await putFile(fileB)
    await clearAllFiles()
    expect(await getAllFiles()).toEqual([])
  })
})

describe("addImageFromBlob", () => {
  it("stores a blob and returns its content-addressed id", async () => {
    const blob = new Blob(["abc"], { type: "image/png" })
    const result = await addImageFromBlob(blob)
    expect(result.id).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(result.mimeType).toBe("image/png")
    expect(result.dataURL.startsWith("data:image/png;base64,")).toBe(true)

    const stored = await getFile(result.id)
    expect(stored).toBeDefined()
    expect(stored?.dataURL).toBe(result.dataURL)
  })

  it("is idempotent on identical content (same id, no duplicate writes)", async () => {
    const blob = new Blob(["abc"], { type: "image/png" })
    const a = await addImageFromBlob(blob)
    const b = await addImageFromBlob(blob)
    expect(a.id).toBe(b.id)
    const all = await getAllFiles()
    expect(all.length).toBe(1)
  })
})
