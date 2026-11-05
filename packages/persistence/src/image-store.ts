import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { blobToDataURL, sha256Hex } from "./binary"
import { FILES_STORE, getDB } from "./db"

export async function putFile(file: ExcalidrawBinaryFile): Promise<void> {
  const db = await getDB()
  await db.put(FILES_STORE, file)
}

export async function getFile(id: string): Promise<ExcalidrawBinaryFile | undefined> {
  const db = await getDB()
  return db.get(FILES_STORE, id)
}

export async function getAllFiles(): Promise<ExcalidrawBinaryFile[]> {
  const db = await getDB()
  return db.getAll(FILES_STORE)
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
