import type { ExcalidrawBinaryFile } from "@excalidraw-clone/scene"
import { type IDBPDatabase, openDB } from "idb"

const DB_NAME = "excalidraw-clone"
const DB_VERSION = 1
const STORE = "files"

interface ExcalidrawDB {
  files: {
    key: string
    value: ExcalidrawBinaryFile
  }
}

let dbPromise: Promise<IDBPDatabase<ExcalidrawDB>> | null = null

function getDB(): Promise<IDBPDatabase<ExcalidrawDB>> {
  if (dbPromise === null) {
    dbPromise = openDB<ExcalidrawDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" })
        }
      },
    })
  }
  return dbPromise
}

export async function putFile(file: ExcalidrawBinaryFile): Promise<void> {
  const db = await getDB()
  await db.put(STORE, file)
}

export async function getFile(id: string): Promise<ExcalidrawBinaryFile | undefined> {
  const db = await getDB()
  return (await db.get(STORE, id)) as ExcalidrawBinaryFile | undefined
}

export async function getAllFiles(): Promise<ExcalidrawBinaryFile[]> {
  const db = await getDB()
  return (await db.getAll(STORE)) as ExcalidrawBinaryFile[]
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function clearAllFiles(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE)
}

/** Test-only: close + drop the cached DB handle so `indexedDB.deleteDatabase()` isn't blocked. */
export async function _resetDBForTesting(): Promise<void> {
  if (dbPromise === null) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}
