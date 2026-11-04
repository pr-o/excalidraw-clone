import { getDB, HANDLES_STORE } from "./db"

const CURRENT_FILE = "current-file"

/**
 * Remembers (or, with null, forgets) the file the drawing is saved to. File handles
 * are structured-cloneable, so they survive a reload; writing again needs the user's
 * permission once per session. Best effort: a handle that cannot be stored (or a
 * browser without IndexedDB) just is not remembered.
 */
export async function storeCurrentFileHandle(handle: FileSystemFileHandle | null): Promise<void> {
  try {
    const db = await getDB()
    if (handle) await db.put(HANDLES_STORE, handle, CURRENT_FILE)
    else await db.delete(HANDLES_STORE, CURRENT_FILE)
  } catch {
    // Not remembered: the next Save after a reload asks for a location.
  }
}

/** The remembered save file, or null. */
export async function loadCurrentFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await getDB()
    const handle = (await db.get(HANDLES_STORE, CURRENT_FILE)) as FileSystemFileHandle | undefined
    return handle ?? null
  } catch {
    return null
  }
}
