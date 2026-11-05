import type { ExcalidrawElement } from "./types"

/** Ids of the stored image binaries these elements draw, each once. */
export const imageFileIds = (elements: Iterable<ExcalidrawElement>): Set<string> => {
  const ids = new Set<string>()
  for (const el of elements) if (el.type === "image" && el.fileId !== null) ids.add(el.fileId)
  return ids
}
