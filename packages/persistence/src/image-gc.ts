import { imageFileIds, type ExcalidrawElement } from "@excalidraw-clone/scene"
import { deleteFile, getAllFiles } from "./image-store"
import { getAllLibraryItems } from "./library-store"
import { listSnapshots, loadSnapshot } from "./snapshot-store"

/** Files younger than this are never collected: another tab may have just stored
 *  one whose element has not been auto-saved yet. */
export const GC_MIN_AGE_MS = 60 * 60 * 1000

const addFileIds = (into: Set<string>, elements: readonly ExcalidrawElement[]): void => {
  for (const id of imageFileIds(elements)) into.add(id)
}

/**
 * Deletes stored image binaries that nothing can ever draw again and returns how
 * many were removed. Images pile up otherwise: removing an element, resetting, or
 * discarding a library item never deletes its picture.
 *
 * A file is kept when the open document (`documentElements`, deleted elements
 * included so a restored document keeps its history), any snapshot or any library
 * item references it, or when it is younger than `minAgeMs`. Anything that cannot
 * be read (a damaged snapshot) cancels the whole run: with an incomplete picture
 * of what is referenced, deleting would risk real data.
 */
export async function collectUnreferencedFiles(
  documentElements: readonly (readonly ExcalidrawElement[])[],
  { now = Date.now(), minAgeMs = GC_MIN_AGE_MS }: { now?: number; minAgeMs?: number } = {},
): Promise<number> {
  const referenced = new Set<string>()
  for (const page of documentElements) addFileIds(referenced, page)

  try {
    for (const meta of await listSnapshots()) {
      const doc = await loadSnapshot(meta.id)
      if (!doc) return 0
      for (const page of doc.pages) addFileIds(referenced, page.elements)
      for (const id of Object.keys(doc.files ?? {})) referenced.add(id)
    }
    for (const item of await getAllLibraryItems()) {
      addFileIds(referenced, item.elements)
      for (const id of Object.keys(item.files ?? {})) referenced.add(id)
    }
  } catch {
    return 0
  }

  let removed = 0
  for (const file of await getAllFiles()) {
    if (referenced.has(file.id) || now - file.created < minAgeMs) continue
    await deleteFile(file.id)
    removed += 1
  }
  return removed
}
