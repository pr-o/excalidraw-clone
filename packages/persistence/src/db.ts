import type { ExcalidrawBinaryFile, LibraryItem } from "@excalidraw-clone/scene"
import { type IDBPDatabase, openDB } from "idb"

export const DB_NAME = "excalidraw-clone"
export const DB_VERSION = 2
export const FILES_STORE = "files"
export const LIBRARY_STORE = "library_items"

export interface ExcalidrawDB {
  files: { key: string; value: ExcalidrawBinaryFile }
  library_items: { key: string; value: LibraryItem }
}

let dbPromise: Promise<IDBPDatabase<ExcalidrawDB>> | null = null

export function getDB(): Promise<IDBPDatabase<ExcalidrawDB>> {
  if (dbPromise === null) {
    dbPromise = openDB<ExcalidrawDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
          db.createObjectStore(LIBRARY_STORE, { keyPath: "id" })
        }
      },
    })
  }
  return dbPromise
}

/** Test-only: close + drop the cached DB handle so `indexedDB.deleteDatabase()` isn't blocked. */
export async function _resetDBForTesting(): Promise<void> {
  if (dbPromise === null) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}
