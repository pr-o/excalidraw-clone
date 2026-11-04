import type { ExcalidrawBinaryFile, ExcalidrawData, LibraryItem } from "@excalidraw-clone/scene"
import { type IDBPDatabase, openDB } from "idb"

export const DB_NAME = "excalidraw-clone"
export const DB_VERSION = 4
export const FILES_STORE = "files"
export const LIBRARY_STORE = "library_items"
export const SNAPSHOTS_STORE = "snapshots"
/** Out-of-line keys: small named values that do not fit the other stores. */
export const HANDLES_STORE = "handles"

export interface Snapshot {
  id: string
  name: string
  createdAt: number
  document: ExcalidrawData
}

export interface ExcalidrawDB {
  files: { key: string; value: ExcalidrawBinaryFile }
  library_items: { key: string; value: LibraryItem }
  snapshots: { key: string; value: Snapshot }
  handles: { key: string; value: FileSystemFileHandle }
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
        if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
          db.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains(HANDLES_STORE)) {
          db.createObjectStore(HANDLES_STORE)
        }
      },
    }).catch((err: unknown) => {
      // Do not cache a failed open (blocked upgrade, private mode): let the next call retry.
      dbPromise = null
      throw err
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
