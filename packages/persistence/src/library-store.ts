import type { LibraryItem } from "@excalidraw-clone/scene"
import { getDB, LIBRARY_STORE } from "./db"

export async function putLibraryItem(item: LibraryItem): Promise<void> {
  const db = await getDB()
  await db.put(LIBRARY_STORE, item)
}

export async function getLibraryItem(id: string): Promise<LibraryItem | undefined> {
  const db = await getDB()
  return (await db.get(LIBRARY_STORE, id)) as LibraryItem | undefined
}

export async function getAllLibraryItems(): Promise<LibraryItem[]> {
  const db = await getDB()
  const items = (await db.getAll(LIBRARY_STORE)) as LibraryItem[]
  return items.sort((a, b) => b.created - a.created)
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

export async function clearLibrary(): Promise<void> {
  const db = await getDB()
  await db.clear(LIBRARY_STORE)
}
