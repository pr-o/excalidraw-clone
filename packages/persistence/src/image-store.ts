import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { blobToDataURL, sha256Hex } from "./binary"
import { _resetDBForTesting as _resetSharedDB, FILES_STORE, getDB } from "./db"

export async function putFile(file: ExcalidrawBinaryFile): Promise<void> {
  const db = await getDB()
  await db.put(FILES_STORE, file)
}

export async function getFile(id: string): Promise<ExcalidrawBinaryFile | undefined> {
  const db = await getDB()
  return (await db.get(FILES_STORE, id)) as ExcalidrawBinaryFile | undefined
}

export async function getAllFiles(): Promise<ExcalidrawBinaryFile[]> {
  const db = await getDB()
  return (await db.getAll(FILES_STORE)) as ExcalidrawBinaryFile[]
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(FILES_STORE, id)
}

export async function clearAllFiles(): Promise<void> {
  const db = await getDB()
  await db.clear(FILES_STORE)
}

export async function addImageFromBlob(blob: Blob): Promise<ExcalidrawBinaryFile> {
  const id = await sha256Hex(blob)
  const existing = await getFile(id)
  if (existing) return existing
  const dataURL = await blobToDataURL(blob)
  const file: ExcalidrawBinaryFile = {
    id,
    mimeType: blob.type !== "" ? blob.type : "application/octet-stream",
    dataURL,
    created: Date.now(),
  }
  await putFile(file)
  return file
}

/** Test-only: re-exported from the shared DB module for backward-compat with the existing test setup. */
export const _resetDBForTesting = _resetSharedDB
