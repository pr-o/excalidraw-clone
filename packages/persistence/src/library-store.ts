import {
  imageFileIds,
  sanitizeElements,
  sanitizeFiles,
  type ExcalidrawBinaryFile,
  type LibraryItem,
} from "@excalidraw-clone/scene"
import { getDB, LIBRARY_STORE } from "./db"
import { getFile, putFile } from "./image-store"

export const EXCALIDRAWLIB_VERSION = 2

interface ExcalidrawLibFile {
  type: "excalidrawlib"
  version: number
  source: string
  libraryItems: LibraryItem[]
  files: Record<string, ExcalidrawBinaryFile>
}

export async function putLibraryItem(item: LibraryItem): Promise<void> {
  const db = await getDB()
  await db.put(LIBRARY_STORE, item)
}

export async function getLibraryItem(id: string): Promise<LibraryItem | undefined> {
  const db = await getDB()
  return db.get(LIBRARY_STORE, id)
}

export async function getAllLibraryItems(): Promise<LibraryItem[]> {
  const db = await getDB()
  return (await db.getAll(LIBRARY_STORE)).sort((a, b) => b.created - a.created)
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(LIBRARY_STORE, id)
}

export async function renameLibraryItem(id: string, name: string): Promise<void> {
  const existing = await getLibraryItem(id)
  if (!existing) return
  await putLibraryItem({ ...existing, name })
}

export async function exportLibraryFile(): Promise<Blob> {
  const libraryItems = await getAllLibraryItems()
  const files: Record<string, ExcalidrawBinaryFile> = {}
  for (const item of libraryItems) {
    if (!item.files) continue
    for (const [fid, bin] of Object.entries(item.files)) {
      files[fid] = bin
    }
  }
  const payload: ExcalidrawLibFile = {
    type: "excalidrawlib",
    version: EXCALIDRAWLIB_VERSION,
    source: "excalidraw-clone",
    libraryItems,
    files,
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
}

export async function importLibraryFile(blob: Blob): Promise<{ added: number; skipped: number }> {
  const text = await blob.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("importLibraryFile: failed to parse JSON")
  }
  const p = parsed as Partial<ExcalidrawLibFile>
  if (p.type !== "excalidrawlib") {
    throw new Error("importLibraryFile: not an excalidrawlib file")
  }
  if (p.version !== EXCALIDRAWLIB_VERSION) {
    throw new Error(`importLibraryFile: unsupported version ${String(p.version)}`)
  }
  if (!Array.isArray(p.libraryItems)) {
    throw new Error("importLibraryFile: libraryItems is not an array")
  }

  // Untrusted file: only well-formed image records are stored.
  const files = sanitizeFiles(p.files)
  for (const bin of Object.values(files)) {
    await putFile(bin)
  }

  let added = 0
  let skipped = 0
  for (const rawItem of p.libraryItems) {
    // Untrusted file: skip entries that are not usable items, and drop unusable elements.
    if (typeof rawItem !== "object" || rawItem === null || typeof rawItem.id !== "string") {
      skipped++
      continue
    }
    const rawElements: unknown = rawItem.elements
    const elements = sanitizeElements(rawElements)
    if (!Array.isArray(rawElements) || (elements.length === 0 && rawElements.length > 0)) {
      skipped++
      continue
    }
    const item: LibraryItem = { ...rawItem, elements }
    if (await getLibraryItem(item.id)) {
      skipped++
      continue
    }
    const itemFiles: Record<string, ExcalidrawBinaryFile> = {}
    for (const fid of imageFileIds(item.elements)) {
      const bin = files[fid] ?? (await getFile(fid))
      if (bin) itemFiles[fid] = bin
    }
    await putLibraryItem({
      ...item,
      ...(Object.keys(itemFiles).length > 0 ? { files: itemFiles } : {}),
    })
    added++
  }
  return { added, skipped }
}
